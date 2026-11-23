# Состояние реализации Kafka и Elastic

Дата: 23 ноября 2026 года. Ветка: codex/kafka-elastic-logging.

## Реализовано

- Winston ECS facade заменяет Pino и pino-http. Сохранены child loggers, metadata, Error/stack, fatal/trace; добавлены request/correlation context, маскировка секретов, лимиты размера/очереди stdout и bounded flush.
- Filebeat, Kafka KRaft, Logstash PQ/DLQ/quarantine, Elasticsearch templates/ILM/roles/TLS и Kibana saved objects подготовлены отдельным test Compose. Production collectors имеют отдельные TLS/SASL конфигурации и service principals.
- Vector service/config и доставка его конфигурации из CI удалены. Backend/frontend Docker logs ротируются; proxy access logs не включают query/headers.
- Сессия, process snapshot и outbox записываются транзакционно; устранены неограниченные по пользователю обращения и фиктивный session ID. Relay публикует с broker ack, сохраняет порядок aggregate и pending записи при отказе Kafka.
- Projection consumer идемпотентен. Notification consumer и direct transport используют общий delivery ledger; Telegram settings/context принадлежат конкретному пользователю. Старые уведомления имеют expiry, внешняя отправка сохраняет документированное окно повтора при crash.
- После перезапуска UI показывает прерванные процессы и требует подтверждения остановки. Автоматического воспроизведения команд оборудованию нет.
- При shutdown оборудование останавливается до сетевого drain, подключающиеся Kafka клиенты отменяются, HTTP и DB effects завершаются до закрытия SQLite. Проверено с реально недоступным broker и pending outbox.
- Инструкция запуска, production provisioning, replay/DLQ, удаления старых credentials и восстановления находится в OBSERVABILITY_RUNBOOK.md.

## Проверки

Локально на Windows с Node.js 24:

- Backend: 322 теста, 25 файлов — успешно.
- Frontend: 71 тест, 8 файлов — успешно; production build успешен.
- Реальный HTTP subprocess: login, mock process, outbox, ECS/request ID, отсутствие query token в логах и штатное завершение — успешно.
- Native Kafka adapter: загрузка библиотеки и сценарий недоступного broker/producer/consumer при shutdown — успешно.
- Compose test/CI/production collectors и app overlays, persistent volumes, private listeners, mappings, Kibana references, shell syntax и workflow YAML — статические проверки успешны.
- Прямые и транзитивные production зависимости Pino отсутствуют по npm ls.

Docker Desktop установлен, но локальный Linux Engine недоступен. Поэтому Filebeat/Logstash validation в реальных образах и canary Filebeat → Kafka → Logstash → Elasticsearch локально не подтверждены. В workflow observability-validate добавлены runtime validation, Alpine backend native-bindings check и canary на отдельном CI стенде с меньшими heap limits. CI canary не запускает Kibana; её реальный bootstrap/доступ также проверяется при приёмке стенда.

## Следующие проверки и расширения

1. Принять CI runtime/canary, затем запустить полный test стек и проверить реальный Docker collection, Kibana import и поиск по request/device/session.
2. На целевом хосте измерить RAM/SSD/IOPS и объёмы потоков, подобрать ёмкость очередей и retention; выполнить outages Kafka/ES, disk saturation, DLQ replay и snapshot restore.
3. Подключить production Kafka/Elasticsearch clusters, PKI, ACL/quotas, snapshots и независимые оповещения. Single-node test Compose не задаёт HA topology.
4. После приёмки оператор удаляет/отзывает прежние Better Stack credentials и связанные alerts/dashboards на внешнем сервисе. Эти действия на VPS/аккаунте здесь не выполнялись.
5. Телеметрия и audit mirror остаются отдельными этапами исходного плана: топики подготовлены, producers/projections для них пока не включены. Аудит в SQLite сохраняет прежнюю best-effort модель до отдельной транзакционной доработки.

Publisher по умолчанию выключен; capture включён. Обычный запуск приложения не требует доступных Kafka/Elastic. Актуальные env-примеры находятся в backend/.env.example и .env.observability*.example; реальные secrets исключены из Git.
