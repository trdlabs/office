# ENV — переменные окружения trading-office

> Файл сгенерирован из apps/server/src/env.ts — не править руками, запусти `npm run env:docs`.
>
> Источник правды — реестр в `apps/server/src/env.ts` (контракт `env-schema.1`,
> control-center `docs/architecture/contracts/env-schema.md`). Машинный экспорт:
> `npm run -s env:schema` (детерминированный JSON в stdout).

- Серверные переменные (`office-server`) читаются ровно в одной точке — `apps/server/src/env.ts`;
  сервер валидирует env на старте fail-fast и перечисляет все невалидные переменные разом.
- `VITE_*` (`office-web`) читаются на билд-тайме через `import.meta.env` (vite) — объявлены здесь,
  но серверный парсер их не трогает.
- Fail-closed (SEC-O1, #32): в connected-режиме (`OFFICE_CONNECTOR_MODE=trading-lab` и/или
  `OFFICE_PLATFORM_ENABLED=true`) сервер отказывается стартовать без непустого
  `OFFICE_OPERATOR_PASSWORD`. Схема описывает форму переменной; авторитетный гейт живёт в
  `apps/server/src/config.ts`.
- Значения секретов (`secret`) не появляются ни здесь, ни в `.env*.example` — только имя и форма.

| Имя | Тип | Required | Default | Метки | Owner unit | Описание |
| --- | --- | --- | --- | --- | --- | --- |
| `OFFICE_AUTH_SECRET` | string | нет | — | secret | `office-server` | HMAC-ключ подписи сессионных токенов оператора; не задан — используется OFFICE_OPERATOR_PASSWORD |
| `OFFICE_AUTH_TTL_MS` | duration_ms | нет | `43200000` | — | `office-server` | Время жизни сессионного токена оператора, мс (по умолчанию 12 часов) |
| `OFFICE_BACKTEST_SUMMARY_INTERVAL_MS` | duration_ms | нет | `500` | — | `office-server` | Интервал между попытками получить summary завершившегося downstream-бэктеста, мс |
| `OFFICE_BACKTEST_SUMMARY_RETRIES` | int | нет | `5` | — | `office-server` | Число попыток получить summary завершившегося downstream-бэктеста |
| `OFFICE_BACKTEST_WATCH_IDLE_MS` | duration_ms | нет | `120000` | — | `office-server` | Idle-гард наблюдателя downstream-бэктестов: стоп после стольких мс без новых событий |
| `OFFICE_BACKTEST_WATCH_MAX_MS` | duration_ms | нет | `900000` | — | `office-server` | Максимальная длительность наблюдения за downstream-бэктестами, мс |
| `OFFICE_CHAT_BOOTSTRAP_INTERVAL_MS` | duration_ms | нет | `750` | — | `office-server` | Интервал между bootstrap-попытками чата/наблюдателей (первое чтение ленты событий), мс |
| `OFFICE_CHAT_BOOTSTRAP_RETRIES` | int | нет | `8` | — | `office-server` | Число bootstrap-попыток чата/наблюдателей (первое чтение ленты событий) |
| `OFFICE_CHAT_FOLLOW_IDLE_MS` | duration_ms | нет | `45000` | — | `office-server` | Idle-гард follow-режима оператор-чата: стоп после стольких мс без новых дельт |
| `OFFICE_CHAT_FOLLOW_MAX_DELTAS` | int | нет | `200` | — | `office-server` | Максимум дельт, которые follow-режим оператор-чата ретранслирует за один запуск |
| `OFFICE_CHAT_FOLLOW_MAX_MS` | duration_ms | нет | `300000` | — | `office-server` | Максимальная длительность follow-режима оператор-чата, мс |
| `OFFICE_CONNECTOR_MODE` | enum(fixture \| trading-lab) | нет | `fixture` | — | `office-server` | Режим коннектора офиса: fixture (демо-данные, standalone) или trading-lab (connected, live-чтение лаборатории) |
| `OFFICE_CORS_ORIGIN` | string | нет | `http://localhost:5174` | — | `office-server` | Разрешённый CORS-origin веб-офиса; обязан совпадать с origin, с которого браузер грузит web-приложение |
| `OFFICE_EVENT_TICK_MS` | duration_ms | нет | `2600` | — | `office-server` | Период тика fixture-продьюсера офисных событий, мс |
| `OFFICE_FIXTURE_LATENCY_MS` | duration_ms | нет | `0` | — | `office-server` | Искусственная задержка ответов fixture-коннектора (демо реалистичной сети), мс |
| `OFFICE_HEARTBEAT_MS` | duration_ms | нет | `15000` | — | `office-server` | Период heartbeat-события в WebSocket-потоке офиса, мс |
| `OFFICE_IMAGE_TAG` | string | нет | `latest` | — | `office-deploy` | Тег опубликованных GHCR-образов office-server/office-web для docker compose (пин конкретного билда, напр. sha-244d217) |
| `OFFICE_OPERATOR_PASSWORD` | string | нет | — | secret | `office-server` | Пароль оператора: включает auth на /api/office/* и WS. В connected-режиме (OFFICE_CONNECTOR_MODE=trading-lab и/или OFFICE_PLATFORM_ENABLED=true) обязателен — сервер отказывается стартовать без него (fail-closed гейт SEC-O1 в loadConfig); standalone (fixture) без него легален |
| `OFFICE_PLATFORM_ENABLED` | bool | нет | `false` | — | `office-server` | Мониторинг trading-platform в офисе; действует только в режиме trading-lab и требует TRADING_PLATFORM_READ_URL/TOKEN |
| `OFFICE_SCORECARD_BOOTSTRAP_INTERVAL_MS` | duration_ms | нет | `750` | — | `office-server` | Интервал между bootstrap-попытками scorecard-фолловера, мс |
| `OFFICE_SCORECARD_BOOTSTRAP_RETRIES` | int | нет | `8` | — | `office-server` | Число bootstrap-попыток scorecard-фолловера |
| `OFFICE_SCORECARD_FETCH_INTERVAL_MS` | duration_ms | нет | `500` | — | `office-server` | Интервал между попытками скачать markdown цикл-скоркарда, мс |
| `OFFICE_SCORECARD_FETCH_RETRIES` | int | нет | `3` | — | `office-server` | Число попыток скачать markdown цикл-скоркарда |
| `OFFICE_SCORECARD_TTL_MS` | duration_ms | нет | `3600000` | — | `office-server` | TTL наблюдения scorecard-фолловера за cycle-run, мс |
| `OFFICE_SERVER_PORT` | int | нет | `8787` | — | `office-server` | Порт HTTP/WS office-server |
| `OFFICE_STREAM_RECONNECT_BASE_MS` | duration_ms | нет | `1000` | — | `office-server` | Базовая задержка экспоненциального reconnect-бэккофа стрима лаборатории, мс |
| `OFFICE_STREAM_RECONNECT_MAX_MS` | duration_ms | нет | `30000` | — | `office-server` | Потолок reconnect-бэккофа стрима лаборатории, мс |
| `OPERATOR_COMPLETION_SUMMARY` | bool | нет | `true` | — | `office-server` | Публиковать completion-summary задач лаборатории в оператор-чат (по умолчанию включено) |
| `OPERATOR_CYCLE_SCORECARD` | bool | нет | `false` | — | `office-server` | Публиковать cycle-скоркард лаборатории в оператор-чат (R5d); действует только в режиме trading-lab |
| `OPERATOR_DOWNSTREAM_BACKTESTS` | bool | нет | `false` | — | `office-server` | Следить за downstream-бэктестами cycle-run и публиковать их summary в оператор-чат; действует только в режиме trading-lab |
| `TRADING_LAB_CHAT_TOKEN` | string | нет | — | secret | `office-server` | Сервисный токен чат-API trading-lab (прокси оператор-чата); без него connected-офис работает без чата |
| `TRADING_LAB_CHAT_URL` | url | нет | `http://localhost:3000` | — | `office-server` | Базовый URL чат-API trading-lab |
| `TRADING_LAB_READ_TOKEN` | string | нет | — | secret | `office-server` | Сервисный токен read-API trading-lab; в режиме trading-lab обязателен (гейт в loadConfig) |
| `TRADING_LAB_READ_URL` | url | нет | `http://localhost:3100` | — | `office-server` | Базовый URL read-API trading-lab; в режиме trading-lab обязан быть задан явно (гейт в loadConfig) |
| `TRADING_LAB_REQUEST_TIMEOUT_MS` | duration_ms | нет | `10000` | — | `office-server` | Таймаут HTTP-запросов офиса к trading-lab, мс |
| `TRADING_PLATFORM_READ_TOKEN` | string | нет | — | secret | `office-server` | Сервисный ops-read токен trading-platform; при OFFICE_PLATFORM_ENABLED=true обязателен (гейт в loadConfig) |
| `TRADING_PLATFORM_READ_URL` | url | нет | `http://localhost:8839` | — | `office-server` | Базовый URL ops-read API trading-platform; при включённом мониторинге обязан быть задан явно (гейт в loadConfig) |
| `TRADING_PLATFORM_REQUEST_TIMEOUT_MS` | duration_ms | нет | `10000` | — | `office-server` | Таймаут HTTP-запросов офиса к trading-platform, мс |
| `ULPC_DIR` | string | нет | — | — | `office-tools` | Каталог Universal-LPC-Spritesheet для build-тула compose-lpc-agents; не задан — используется ~/tmp/ulpc (вычисляется, статического дефолта нет) |
| `VITE_OFFICE_GATEWAY_URL` | url | нет | `http://localhost:8787` | — | `office-web` | Build-time (vite): базовый HTTP-URL office-server для connected-веба |
| `VITE_OFFICE_GATEWAY_WS_URL` | url | нет | — | — | `office-web` | Build-time (vite): WS-URL office-server; не задан — шлюз выводит его из VITE_OFFICE_GATEWAY_URL |
| `VITE_OFFICE_MODE` | enum(mock \| connected) | нет | `mock` | — | `office-web` | Build-time (vite): режим веб-офиса — mock (fixtures в браузере) или connected (live-шлюз office-server) |
