# @trading-office/web

Боевая React/DOM-оболочка вокруг `office-visual-kit`: внешний экран-вход,
mock-логин и этаж Trading Lab с роутером панелей. PixiJS рисует только этаж —
внешний экран, логин, шапка, панели и маршрутизация сделаны на React/DOM.
**Read-only — без прав на исполнение.**

## Запуск

Шлюз выбирается на этапе сборки переменной `VITE_OFFICE_MODE`:

| Режим | Команда (из корня репозитория) | Шлюз |
| --- | --- | --- |
| `mock` (по умолчанию) | `npm run dev` | `MockOfficeGateway` — фикстуры прямо в браузере, без бэкенда |
| `connected` | `npm run dev:connected` | `HttpOfficeGateway` → сервер `@trading-office/server` (HTTP-снимки + один WebSocket) |

```bash
npm install
npm run dev            # mock → http://localhost:5174
npm run dev:connected  # сервер (:8787) + веб в режиме connected, вместе
```

Режим `connected` читает `.env.connected`; дефолты — в `.env.example`:

```ini
VITE_OFFICE_MODE=connected
VITE_OFFICE_GATEWAY_URL=http://localhost:8787
VITE_OFFICE_GATEWAY_WS_URL=ws://localhost:8787
```

Это единственные переменные, которые попадают в браузер, — токены `trading-lab`
и `trading-platform` живут на сервере и в бандл не уходят.

## Архитектура

- **Pixi/office-visual-kit рисует только этаж.** Внешний экран, логин, панели,
  шапка и маршрутизация — React/DOM.
- **Роутер владеет состоянием вида и выделения; сцена следует за ним** через
  синхронный reconcile-guard (без циклов).
- **Единственная граница данных:** read-only интерфейс `OfficeGateway` — его
  реализуют `MockOfficeGateway` (фикстуры) или `HttpOfficeGateway` (реальный
  шлюз) → `OfficeRuntimeStore` → шов `applyStatusToScene` → `scene.setAgentStatus`.
  Панели не трогают Pixi напрямую.
- **Статус соединения** приходит из `subscribeConnection` стора, поэтому оболочка
  отражает live / переподключение / офлайн в режиме `connected`.
- У `sendOperatorMessage` **нет прав на исполнение**: в `mock` он инертный
  (принят + имитация ответа через поток событий); в режиме `connected` он POST-ит
  в шлюз, который либо имитирует ответ (`fixture`), либо проксирует его в чат-API
  `trading-lab` (режим `trading-lab`).

## Структура

```text
src/
  App.tsx                 провайдеры + маршруты
  app/                    guard RequireSession, шапка AppShell
  outside/                OutsideScreen (фасад здания + дверь), LoginModal
  city/                   пиксельный город-задник
  session/                чистый редьюсер/guard + SessionContext
  runtime/                types, OfficeGateway, MockOfficeGateway, HttpOfficeGateway,
                          OfficeRuntimeStore, sceneBridge, RuntimeContext
  floor/                  FloorScreen, panelRegistry, PanelDock, ExitConfirm,
                          floorConfig/floorSelection, objectPanels, panels/*
```

Карты и ассеты этажа синхронизируются из `@trading-office/trading-lab-floor`
в `public/` на `predev`/`prebuild` (`tools/sync-floor-public.mjs`); эти копии —
git-игнорируемые сгенерированные артефакты.
