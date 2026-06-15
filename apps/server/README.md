# @trading-office/server

Read-only шлюз офиса (Hono). Отдаёт HTTP/WS-API этажа, компонуя
`TradingLabReadConnector` (read API trading-lab) и read-only
`PlatformMonitoringConnector` (ops read API trading-platform). **Без прав на
исполнение** — пути на запись/команды нет.

## Запуск

```bash
# из корня репозитория
npm run dev:server   # tsx watch → http://localhost:8787  (режим fixture)
```

По умолчанию шлюз работает в режиме `fixture` (детерминированные демо-данные, без
апстрима). Чтобы направить его на реальный `trading-lab`, задайте
`OFFICE_CONNECTOR_MODE=trading-lab` и read-доступы. Команда `npm run dev:connected`
(из корня) поднимает этот сервер и веб вместе.

## Конфигурация

Читается из `process.env` при старте — **авто-загрузки `.env` нет**, поэтому
переменные нужно экспортировать (или передать через ваш process-manager). Полный
список — в `.env.example`.

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `OFFICE_SERVER_PORT` | `8787` | порт HTTP/WS |
| `OFFICE_CORS_ORIGIN` | `http://localhost:5174` | разрешённый origin веба |
| `OFFICE_CONNECTOR_MODE` | `fixture` | `fixture` \| `trading-lab` |
| `TRADING_LAB_READ_URL` · `TRADING_LAB_READ_TOKEN` | — | read API trading-lab (**обязательно** в режиме `trading-lab`) |
| `TRADING_LAB_CHAT_URL` · `TRADING_LAB_CHAT_TOKEN` | — | прокси оператор-чата (опционально) |
| `OFFICE_PLATFORM_ENABLED` | `false` | мониторинг платформы (только в режиме `trading-lab`) |
| `TRADING_PLATFORM_READ_URL` · `TRADING_PLATFORM_READ_TOKEN` | — | ops read API trading-platform (**обязательно** при включённом мониторинге) |

Read-токены остаются на сервере и никогда не попадают ни в ответ, ни в состояние
источника, ни в лог.

## API

Все маршруты read-only, с префиксом `/api/office`:

| Метод | Путь | Отдаёт |
| --- | --- | --- |
| `GET` | `/agents/statuses` | статусы агентов на этаже |
| `GET` | `/hypotheses` | гипотезы |
| `GET` | `/backtests` | бэктесты |
| `GET` | `/knowledge` | базу знаний |
| `GET` | `/bots` | бот-раны платформы (режим `trading-lab`) |
| `GET` | `/infra` | здоровье источников/инфраструктуры (`sources[]`) |
| `POST` | `/operator/messages` | сообщение оператора → чат |
| `WS` | `/events` | поток событий: статусы, чат, heartbeat |

## Надёжность: апстрим деградирует, а не падает

Оба апстрим-коннектора держат одну линию: сбой апстрима становится
**типизированным видимым состоянием источника**, а не общим HTTP 500 на дашборде.

### trading-lab — health с учётом авторизации vs чтение данных (два разных сигнала)

- **`trading-lab-read-api`** (infra-источник) — health-проба с учётом
  авторизации: открытый `/readyz` (процесс/БД) **плюс** проба `/v1/authz`,
  отправленная с тем же read-токеном, что и реальные чтения. Поэтому неверный
  read-токен виден как `degraded` / `auth_failed`, а не как ложный `live`.
- **`trading-lab-read`** (infra-источник) — итог последнего чтения *данных*
  (`/v1/agents`, `/v1/hypotheses`, `/v1/backtests`). Чтение данных может
  деградировать (таймаут, 5xx, битый ответ), пока `/readyz` + `/v1/authz` ещё
  проходят, поэтому оно отслеживается отдельно. В `detail` едет стабильный,
  не содержащий токена код причины.

Агрегирующие/дашбордные эндпоинты (`agent-statuses`, `hypotheses`, `backtests`)
**никогда** не отдают 500 при сбое апстрим-лаборатории: они возвращают
пустую/дефолтную проекцию (200), а сбой фиксируется как состояние источника
`trading-lab-read` выше. Строгий эндпоинт детали по конкретному агенту
(`agent activity`) вместо этого отдаёт **типизированный** статус (`401` при сбое
авторизации, `502` иначе) — никогда не общий 500. Ни один ответ, состояние
источника или лог не содержит read-токена.

### Таксономия кодов причины апстрима (`detail` у `trading-lab-read`)

| reasonCode | state | причина |
| --- | --- | --- |
| `auth_failed` | degraded | read лаборатории вернул 401/403 |
| `upstream_unreachable` | error | сетевая ошибка / ECONNREFUSED / ENOTFOUND |
| `upstream_timeout` | error | таймаут клиента (запрос прерван) |
| `upstream_5xx` | error | read лаборатории вернул 5xx |
| `upstream_bad_response` | error | не-JSON / неожиданная форма ответа |
| `upstream_error` | error | неклассифицированный сбой |

Оператор видит это в панели **Data node / Infra** (`GET /api/office/infra` →
`sources[]`), каждый источник отрисован как `state (detail)`. Поэтому
деградировавший источник данных лаборатории не кладёт остальной дашборд — здоровье
ботов, инфраструктура платформы и этаж продолжают рисоваться из своих источников.

Коннектор платформы ведёт себя так же (best-effort по каждому аспекту; `bot-health`
и источники `platform-*` сообщают, почему) — он и есть шаблон, который это зеркалит.
