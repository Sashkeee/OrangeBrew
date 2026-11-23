# Переход на Kafka и Elastic

Текущее решение: Winston ECS JSON → Docker logs → Filebeat → Kafka → Logstash → Elasticsearch → Kibana.

Pino, pino-http, pino-pretty, Vector service и vector.test.toml удалены. Все точки логирования используют общий utils/logger.js с прежним контрактом child/metadata/error и новым ECS formatter. HTTP logging выполняет middleware/requestLogger.js; request/user context передаётся через AsyncLocalStorage. Текст и метаданные очищаются от секретов до stdout.

## Порядок развёртывания

1. Выполнить backend/frontend тесты и node infra/observability/validate.mjs.
2. Подготовить приватную .env.observability через generate-env, отдельно поднять infrastructure Compose.
3. Выполнить validate.mjs --runtime и smoke.mjs на Docker Engine, затем проверить реальный API request ID и device_log в Kibana.
4. Развернуть приложение. Publisher по умолчанию выключен; Kafka overlay подключается после проверки инфраструктуры.
5. После приёмки удалить legacy Vector container адресно, убрать старые environment credentials с VPS, отозвать source token Better Stack и выключить связанные alerts/dashboards.

## Проверки и ограничения

Backend тесты проверяют ECS, секреты, HTTP concurrency, device rate limits, transactional outbox, scope, retry/ack/duplicates, recovery, Telegram cutover и завершение приложения при недоступном broker. Статическая проверка Compose не доказывает работоспособность pipeline в реальных образах; для этого предусмотрены runtime validation и canary smoke.

Подробные команды, ограничения single-node test и production TLS/HA, DLQ/replay, snapshots и безопасный откат: [инструкция эксплуатации](OBSERVABILITY_RUNBOOK.md). История прежней миграции console → Pino доступна в Git.
