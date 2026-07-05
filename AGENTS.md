# AGENTS.md — trading-office

This repository is part of the `trdlabs` trading ecosystem.

**Before planning or coding, read `../control-center/` when the task involves:**
- other repositories, system architecture, or integration boundaries
- API, MCP, SDK, or contract changes
- rollout, migration, or cross-repo validation

**Read order when triggered:**
1. `../control-center/repos.yaml`
2. `../control-center/AGENTS.md`
3. `../control-center/repos/trading-office.md`

If `../control-center` is absent (standalone clone), use local repo docs only.

> Гид для AI-агентов (Codex, Claude Code и др.). Быстрый контекст + команды, чтобы
> не тратить токены на разбор репозитория.

## Что это
**Визуальная диспетчерская (control room)** для агентных торговых систем —
pixel-art «офис», где каждый AI-агент превращается в спрайт за столом с живым
статусом (`running…`, `thinking…`, `backtesting…`, `reviewing…`). Пульт наблюдения
и **управления** поверх других систем, а не самостоятельная торговая система.

⚠️ **Ключевой принцип — офис ВЫРАЖАЕТ намерение, но НЕ исполняет.** Офис эволюционирует
из чистого read-only в **мониторинг + управление**: он может *инициировать* действия, но
только как тонкий клиент к платформенным write-поверхностям, которые сами
валидируют / клампят / допускают / исполняют. Вся политика и исполнение — server-side, на
`trading-platform`. Офис не держит execution-авторитета.
- **Можно:** читать состояние (Ops / Research Read) и слать запросы-намерения на платформенные
  write-endpoints (напр. промоушен risk-профиля — платформа зажмёт его в guardrails и прогонит
  admission + smoke).
- **Нельзя:** самому принимать торговые решения, обходить платформенные гейты, писать напрямую в
  БД платформы, встраивать execution-логику в офис. Истина по исполнению/данным — `trading-platform`.
- Первая подключённая агентная система — `trading-lab` (её 7 агентов на «этаже» офиса).
- В demo/research можно указывать на `trading-mock-platform` без изменения кода.

## Стек
- **TypeScript**, npm workspaces (монорепо): `apps/`, `packages/`, `examples/`, `tools/`
- Веб-клиент `@trading-office/web` (pixel-art фронтенд), сервер `@trading-office/server`
- `concurrently` для одновременного запуска server+web
- Коннекторы: Ops Read / Research Read (чтение) + платформенные write-endpoints (инициирование
  действий; вся валидация/политика — на платформе, прямого доступа к её БД нет)

## Структура
- `apps/` — приложения (`web` — фронтенд-офис, `server` — бэкенд-коннектор)
- `packages/` — общие пакеты (в т.ч. `@trading-office/trading-lab-floor`)
- `examples/trading-lab-research-floor/` — пример «этажа»
- `tools/` — утилиты (напр. `sync-floor-public.mjs` синхронизирует ассеты)
- `docs/`, `HOW_TO_USE.md`, `ROADMAP.md` — документация, инструкция, дорожная карта

## Команды
```bash
npm install
npm run dev              # dev веб-клиента (@trading-office/web)
npm run dev:server       # dev сервера
npm run dev:connected    # server + web одновременно (concurrently)
npm run dev:web:connected
npm run build            # сборка всех workspaces
npm run typecheck        # типы по всем workspaces
npm run test             # тесты по всем workspaces
npm run generate         # генерация этажа trading-lab-floor
npm run verify:assets    # проверка синхронизации ассетов этажа

# Подключение к mock-платформе (без правок кода) — переменные окружения:
#   OFFICE_CONNECTOR_MODE=trading-lab
#   OFFICE_PLATFORM_ENABLED=true
#   TRADING_PLATFORM_READ_URL=http://localhost:8839
#   TRADING_PLATFORM_READ_TOKEN=<non-empty>
```

## Правила для агента
- **Офис не исполняет и не решает — он инициирует.** Любое действие (write) идёт запросом на
  платформенный write-endpoint, который гейтит/клампит его server-side. Не встраивай в офис
  торговые решения, обход гейтов или execution-логику; не пиши напрямую в БД платформы.
- Действия оператора требуют authZ + аудит-след + подтверждение (переиспользуй operator-auth и
  operator-confirmation UI); идемпотентность запросов — на стороне вызова.
- Данные для чтения берутся только с read-surfaces (Ops Read / Research Read).
- Ассеты этажа держи синхронными (`verify:assets` должен проходить).
- Соблюдай границы workspaces — общий код выноси в `packages/`, не дублируй.
- README/документация и уточняющие вопросы — на русском.

## Навигация по коду
Для поиска символов/связей предпочитай codegraph MCP вместо ручного grep+read.
