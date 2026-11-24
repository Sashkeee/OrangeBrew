# OrangeBrew Kafka и Elastic

Реализованный локальный/test конвейер: Winston ECS JSON → Docker json-file → Filebeat → Kafka → Logstash → Elasticsearch → Kibana. Stateful сервисы запускаются отдельно от приложения; штатный deploy backend/frontend их не пересоздаёт. Управление оборудованием не зависит от доступности этого конвейера.

Подробный разбор проекта, полей логов, Kafka groups/offsets и практические примеры поиска/графиков: [руководство по архитектуре и логированию](PROJECT_AND_LOGGING_GUIDE.md).

## Версии и границы стенда

Образы закреплены: Elastic Stack 9.5.7, Apache Kafka 4.4.0 JVM, BusyBox 1.37.0 для canary. Проверять совместимость при обновлении всего набора. Compose требует современный Docker Compose v2 с `service_completed_successfully` и `config --format json`.

`docker-compose.observability.yml` предназначен для локального/test стенда: один Kafka broker/controller, один Elasticsearch node, RF1/min ISR1, replicas=0. Kafka доступна только на внутренней Docker network; опубликованных Kafka/controller портов нет. Elasticsearch и Kibana используют TLS и аутентификацию, их порты привязаны к 127.0.0.1.

Постоянные volumes: Kafka data, Elasticsearch data, сертификаты, Filebeat registry/disk queue, Logstash PQ/DLQ. Никогда не удалять эти volumes для устранения обычного сбоя. Ротация Docker логов backend: 10 × 20 MiB, frontend: 5 × 10 MiB. Эти значения подлежат пересчёту по фактическому потоку.

Начальный объём RAM для совместного стенда — ориентировочно 16–24 GiB с учётом приложения и ОС. Проверить свободное место и лимит `vm.max_map_count` согласно документации выбранной версии Elasticsearch. Docker Desktop должен использовать Linux containers. Для collection реальных контейнеров нужен доступ к Linux daemon paths `/var/lib/docker/containers` и Docker API; Windows-пути контейнерных файлов для этого не подходят.

## Первый запуск

Из корня репозитория:

```bash
node infra/observability/validate.mjs
node infra/observability/generate-env.mjs test
docker compose --env-file .env.observability -f docker-compose.observability.yml up -d
docker compose --env-file .env.observability -f docker-compose.observability.yml ps -a
```

Generator создаёт `.env.observability` с криптографически случайными base64url secrets и не перезаписывает существующий файл. Хранить файл в закрытом secret store/настройках хоста. Не копировать его в Git, логи CI, issue или чат. Пример `.env.observability.example` не содержит готовых секретов. Windows не применяет POSIX file mode; проверить ACL файла средствами ОС.

Порядок запуска задаётся depends_on и healthchecks: certificates → Elasticsearch → elastic-bootstrap → Kibana; Kafka → kafka-bootstrap; Logstash запускается после обоих bootstrap; Filebeat после создания топиков. `kibana-bootstrap` импортирует data view, investigations и панель Operations после готовности Kibana. Контейнеры bootstrap должны завершиться с exit code 0; продолжающие работать сервисы должны быть healthy.

Проверить:

```bash
docker compose --env-file .env.observability -f docker-compose.observability.yml logs --tail=50 elastic-bootstrap kafka-bootstrap kibana-bootstrap
```

Для HTTPS клиента получить только публичный CA certificate:

```bash
mkdir -p .local
docker compose --env-file .env.observability -f docker-compose.observability.yml cp elasticsearch:/usr/share/elasticsearch/config/certs/ca/ca.crt .local/elastic-ca.crt
```

Kibana: `https://localhost:5601`. Оператор: `orangebrew_operator`, пароль — OPERATOR_PASSWORD из приватной конфигурации. При доступе к VPS использовать SSH tunnel к localhost:5601 и localhost:9200; проверять сертификат с созданным CA. Корневой пользователь `elastic` предназначен для bootstrap/восстановления, runtime ingest использует `orangebrew_ingest` с create_doc и view_index_metadata. Оператор имеет чтение backend/device/proxy/debug и управление Kibana; audit index не включён в его права чтения.

## Проверка конвейера

Для работающего стенда:

```bash
node infra/observability/smoke.mjs
```

Скрипт включает изолированный fixture input Filebeat, создаёт уникальный canary ID, записывает ECS JSON в fixture volume и ожидает его появления в Elasticsearch не более 120 секунд. Он проверяет Filebeat → Kafka → Logstash → Elasticsearch. В Kibana открыть Dashboard → OrangeBrew Operations и найти `event.id` из результата.

Для запуска стенда и smoke одной командой:

```bash
node infra/observability/smoke.mjs --start
```

Этот canary не заменяет проверку Docker collection и Winston. После подключения backend выполнить реальный запрос API и найти его по `orangebrew.request.id`. Проверить устройство через `device_log`, выбранную session и пользователя. Для Docker Desktop fixture input позволяет проверить ingest при недоступном host mount контейнерных файлов.

На Linux-хосте с json-file logs можно отдельно проверить Winston и Docker autodiscovery без запуска управления оборудованием:

```bash
docker build -t orangebrew-backend-check ./backend
node infra/observability/docker-smoke.mjs
```

Проверка создаёт изолированный контейнер без сети с test labels, пишет запись через настоящий logger, ждёт её в Elasticsearch и удаляет только свой контейнер. Полный test стенд должен быть запущен, а Filebeat иметь доступ к `/var/lib/docker/containers`.

Импорт объектов и готовность Kibana можно повторно проверить командой `node infra/observability/kibana-smoke.mjs`. В CI используется overlay `docker-compose.observability.ci.yml` и флаг `--ci`: ingest останавливается после своих проверок, чтобы освободить память для Kibana; дополнительно проверяется доступ оператора к data view, dashboard и сохранённым расследованиям. Этот режим предназначен для одноразового CI стенда.

Проверка конфигураций внутри реальных образов, включая встроенные Ruby tests normalizer:

```bash
node infra/observability/validate.mjs --runtime
```

Команда требует работающего Docker daemon, может загрузить образы и создаёт сертификаты test volume. Она не публикует сообщения и не отправляет пользовательские уведомления. Обычный `validate.mjs` требует только Docker Compose CLI; проверяет синтаксис Compose, overlays, приватность listener, наличие volumes, JSON mapping и ссылки saved objects, не подключается к daemon.

## Подключение test приложения

Обычный `docker-compose.test.yml` запускается без Kafka/Elastic, оставляя `KAFKA_PUBLISH_ENABLED=false`. Winston пишет локальные JSON логи; при запущенном Filebeat они собираются по labels.

Для публикации доменных событий и присоединения backend к существующей сети:

```bash
APP_ENV=test docker compose -f docker-compose.test.yml -f docker-compose.kafka.yml up -d backend-test frontend-test
```

JWT_SECRET и прочие application secrets задаются обычным способом. `.env.observability` относится к отдельному инфраструктурному Compose. Не передавать infrastructure superuser password в backend.

Чтобы последующие application deploys сохраняли Kafka overlay, создать на сервере пустой marker `.kafka-enabled-test` в каталоге OrangeBrew. Workflow выбирает overlay по наличию этого файла. Удаление marker возвращает следующий deploy к обычному Compose; publisher необходимо отключить в application configuration. Внутри приложения capture и publish — разные флаги: остановка publisher сохраняет накопленный outbox, остановка capture прекращает создание новых событий.

## Формат и маршрутизация

Filebeat autodiscover выбирает только контейнеры с `orangebrew_collect=true` и `orangebrew_env`, совпадающим с APP_ENV. У сервисов инфраструктуры таких labels нет: собственные ошибки не вызывают бесконечный цикл логирования.

Container parser снимает Docker envelope, ndjson parser разворачивает ECS dotted keys под `orangebrew_raw`. Доверенные сведения об окружении и контейнере лежат отдельно в `orangebrew_source`. Logstash переносит только разрешённые поля и последним назначает service/environment/data_stream. Невалидный JSON, timestamp, level и неразвёрнутые dotted keys направляются в quarantine.

Backend topic: `orangebrew.<env>.logs.backend.v1`; device topic выбирается только для `event.dataset=orangebrew.device`; proxy имеет собственный topic. Debug/trace направляются в отдельный Elasticsearch dataset с коротким lifecycle. Kafka topic key — container ID. Для доменных событий используется отдельный ключ user/session либо user/device.

Frontend nginx получает `infra/nginx/orangebrew.conf` через bind mount. Его JSON access log содержит только метод, очищенный путь `$uri` без query, статус и duration. Нативные nginx stderr errors остаются в локальных Docker logs, поскольку могут содержать исходный URL. Filebeat отбрасывает proxy stderr до Kafka. Caddy на хосте в эту конфигурацию collection не включён; перед его отдельным подключением подготовить source-side очистку URI/headers.

Data streams: `logs-orangebrew.backend-<env>`, `.device-`, `.proxy-`, `.audit-`, `.debug-`. ILM: backend/device/proxy 14 суток, audit 30, debug 3, rollover 7 суток или 20 GiB primary shard. Срок удаления считается после rollover, поэтому фактическое хранение может быть дольше. Audit stream подготовлен инфраструктурой; публикация audit projection включается приложением отдельно.

Kafka log topics хранятся 3 суток, process/audit 30, quarantine 7, process DLQ 14. `retention.bytes=5 GiB` применяется **к каждой partition**, а не к целому кластеру. Это верхняя граница удержания, не предварительное выделение диска. Проверить суммарные объёмы всех partitions, log segments и остальных volumes перед эксплуатацией.

## Отказы и восстановление

Filebeat использует registry и disk queue 1 GiB. При недоступной Kafka очередь заполняется, затем чтение замедляется. Непрочитанные файлы могут быть удалены Docker rotation. Размеры очередей и исходных файлов должны покрывать согласованный простой; не обещается безусловное отсутствие потерь.

Logstash Kafka `enable_auto_commit=false` фиксирует offset после помещения записи в persistent queue, а не после индексации в Elasticsearch. PQ — 1 GiB на локальном volume, checkpoint.writes=1. Потеря диска PQ после commit требует Kafka replay. PQ не реплицируется.

1. **Elasticsearch недоступен:** проверить ES health/disk, затем PQ и Kafka lag; восстановить ES, дождаться уменьшения backlog. Сохранить volumes и offsets.
2. **Kafka недоступна:** приложение продолжает прямое управление; Filebeat/outbox накапливают ограниченную очередь. Восстановить broker/network, проверить producer errors и возраст старейшего outbox события.
3. **Неверная запись:** проверить `logs.quarantine.v1` либо локальный Logstash DLQ. Исправить mapping/normalizer, повторить выбранные записи через отдельную recovery group/destination.
4. **Потеря PQ:** зафиксировать диапазон Kafka offsets и остановить нужный consumer. Создать отдельную recovery group, прочитать сохранённый диапазон в recovery destination. Сверить event IDs/sequence перед переносом результата. Не сбрасывать offsets рабочей группы вслепую.
5. **Заполнение диска:** остановить рост некритичного debug потока, проверить backlog и retention, обеспечить ёмкость. Команды остановки оборудования должны оставаться доступны. Не удалять SQLite, Kafka или Elasticsearch volumes.

Рестарт конкретного indexer:

```bash
docker compose --env-file .env.observability -f docker-compose.observability.yml restart logstash
```

Для проверки Kafka consumer lag:

```bash
docker compose --env-file .env.observability -f docker-compose.observability.yml exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group orangebrew-test-logs-indexer-v1
```

Logstash DLQ включён для поддерживаемых ошибок ES output (включая per-document 400/404 и настроенный HTTP 413). Он не перехватывает любой произвольный сбой. 409 учитывается отдельно; повторные доставки обычных логов допустимы. Стабильный event.id не гарантирует дедупликацию между backing indices после rollover.

## Панели, метрики и оповещения

Bootstrap импортирует data view, saved investigations (errors, HTTP, devices, process, auth, delivery), графики объёма/ошибок и Operations dashboard. Время отображается Europe/Moscow; исходный timestamp хранится UTC. Сохранённые объекты находятся в `infra/kibana/orangebrew.ndjson`.

API метрик Filebeat: 5066, Logstash: 9600, Elasticsearch: 9200 доступны внутри observability network, первые два не публикуются на host. Настроить независимый scraper/health monitor для queue occupancy, Kafka lag, rejected writes, disk watermarks и health. Sender/connector оповещений требует выбранного оператором канала и credentials; в репозитории готовые recipient secrets отсутствуют.

Обязательные начальные alarms: safety stop/fatal, offline устройство при активной сессии, растущий Kafka lag и outbox age, новые quarantine/DLQ записи, p95 ingest delay >60 секунд, очередь >70/85%, недоступность ES/Kibana. Недоступность самой observability системы проверять по независимому каналу. Панель по логам сама по себе не обеспечивает этот контроль.

## Production

До production определить ёмкость, количество узлов, требования к RPO/RTO и управление сертификатами. Для Kafka использовать managed service либо RF3/min ISR2 в независимых failure domains, отдельный controller quorum, TLS/SASL и ACL/quota для producer, indexer и consumers. Для Elasticsearch нужны размещение replicas на разных узлах и отдельный snapshot repository.

Готовая конфигурация collector/indexer: docker-compose.observability.production.yml, infra/filebeat/filebeat.production.yml и infra/logstash/pipeline/logs.production.conf. Пример service credentials/CA paths — .env.observability.production.example; реальные значения хранить в .env.production.local либо secret store. В каталоге OBSERVABILITY_CERTS_DIR ожидаются kafka-ca.crt, kafka.truststore.p12 и elastic-ca.crt. Backend production overlay монтирует тот же CA directory read-only и передаёт согласованный SASL mechanism. Production publisher отклоняет KAFKA_SSL=false.

```bash
docker compose --env-file .env.production.local -f docker-compose.observability.production.yml config --quiet
docker compose --env-file .env.production.local -f docker-compose.observability.production.yml up -d
```

Скрипт infra/kafka/topics-production.sh предназначен для предварительно настроенного production Kafka и требует client config с TLS/SASL; проверить RF/min ISR и ACL перед выполнением. Elasticsearch templates/roles/snapshots в production подготавливаются отдельно с настройками replicas по topology.

Overlay `docker-compose.kafka.prod.yml` подключает приложение к заранее созданной сети `orangebrew-observability-prod` и требует KAFKA_BROKERS, KAFKA_SSL и SASL service credentials. Проверить реальное значение KAFKA_SSL=true и доверенную цепочку CA. Для production Filebeat/Logstash подготовить окружение с SASL_SSL output/input, отдельными principal ACL и production bootstrap settings; локальный plaintext KRaft стенд не переносится в production без этой настройки.

Для сохранения overlay при deploy-prod создать на сервере marker `.kafka-enabled-prod` после успешной ручной проверки. Stateful observability provisioning остаётся отдельной операцией. Обновлять по одному компоненту, сначала проверяя совместимость, snapshots и recovery на test.

Snapshots Elasticsearch хранить вне его диска; настроить repository и ежедневную snapshot policy, затем выполнить restore в отдельный кластер. Kafka retention покрывает только своё окно сообщений и не заменяет snapshot restore. CA private key в локальном test volume предназначен для стенда; production сертификаты выдаются и хранятся через установленную PKI/secret management.

## Проверки приложения и восстановление процесса

GET /api/admin/observability требует admin JWT и возвращает backlog/age outbox, состояния relay/consumers и pending/dropped/failed logger. Liveness /api/health сохраняется при недоступном ingest. В heartbeat эти значения передаются в структурированных полях; normalizer сохраняет диагностический context и numeric metrics для Kibana.

После рестарта GET /api/process/status возвращает recovery snapshots для текущего пользователя. Страницы затирания/кипячения показывают подтверждение остановки и блокируют новый старт до успешного POST /api/process/stop. Проверить физическое состояние оборудования; подтверждение не возобновляет варку.

Для Telegram environment credentials нужно указать TELEGRAM_OWNER_USER_ID. При смене NOTIFICATIONS_TRANSPORT сохранять notification_delivery и outbox; consumer проверяет уже отправленные event IDs. При shutdown pending fetch отменяется, его результат фиксируется до закрытия БД. Внешняя доставка и SQLite commit не атомарны: crash после успешного send может дать повтор.

Полный shutdown budget учитывает KAFKA_DELIVERY_TIMEOUT_MS, короткий setup attempt и flush; оборудование останавливается сразу. Не повышать delivery timeout без оценки допустимого времени остановки процесса backend.

## Удаление старой интеграции

В коде удалены Vector service/config и доставка его TOML из CI. Test deploy адресно удаляет legacy контейнер `orangebrew-vector-test`, если он остался orphan. Состояние приложения и volumes эта операция не затрагивает.

После приёмки нового конвейера оператор удаляет BETTERSTACK_TOKEN из VPS/secret store, отзывает source token и отключает относящиеся к прежней интеграции alerts/dashboards. Исторические данные Better Stack обрабатываются по принятому сроку хранения. Эти внешние операции не выполняются автоматически при запуске нового Compose.

## Первичные источники

- [Winston ECS formatter](https://www.elastic.co/docs/reference/ecs/logging/nodejs/winston).
- [Filebeat filestream](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-filestream), [autodiscover](https://www.elastic.co/docs/reference/beats/filebeat/configuration-autodiscover), [Kafka output](https://www.elastic.co/docs/reference/beats/filebeat/kafka-output).
- [Kafka Docker image](https://kafka.apache.org/44/getting-started/docker/).
- [Logstash Kafka input](https://www.elastic.co/docs/reference/logstash/plugins/plugins-inputs-kafka), [persistent queues](https://www.elastic.co/docs/reference/logstash/persistent-queues), [DLQ](https://www.elastic.co/docs/reference/logstash/dead-letter-queues).
- [Elasticsearch Docker setup](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-compose), [data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams).
