# ROADMAP — trading-office

Дорожная карта офиса. Пункты пишем с достаточным контекстом, чтобы отдельный агент/инстанс
мог взять задачу без дополнительного разбора соседних репозиториев.

> **Мандат офиса (2026-07):** офис перешёл от чистого read-only к **мониторингу + управлению**.
> Он *инициирует* действия, но не исполняет: любой write идёт запросом на платформенный
> write-endpoint, который валидирует/клампит/допускает/исполняет server-side. Подробности и
> границы — в `AGENTS.md`.

---

## 🔜 Risk-конфигуратор промоушена (стиль Hummingbot)

**Статус:** запланировано, не начато. Последний пункт фронта `#profile-management` (платформенная
часть закрыта — см. ниже). Задача предполагает отдельный инстанс Claude Code, запущенный в
`trading-office`.

### Что хотим

UI-панель «конфигуратор риска» в веб-офисе (`apps/web`, React 19 + Vite + PixiJS): оператор
подбирает risk-профиль стратегии в наглядной форме (в духе Hummingbot-конфигуратора), офис
показывает, **что с этим профилем сделает платформа**, и по подтверждению **инициирует
промоушен** через платформенный write-endpoint:

1. **Дропдаун именованных пресетов** — `conservative | default | aggressive` (контракт платформы
   085, см. ниже). Выбор пресета заполняет форму.
2. **Форма risk-профиля** — секции `sizing / stops / dca` (полная форма ниже).
3. **Live-preview клампа guardrails** — по мере правки офис локально считает, какие поля выйдут
   за платформенные границы (контракт 086), и показывает «было → станет» (`ClampRecord`), т.е.
   ровно то, что платформа зажмёт на промоушене. Делает невидимую политику видимой ДО применения.
4. **Применение (write) через платформу** — по явному подтверждению оператора офис шлёт
   запрос-намерение на платформенный write-endpoint промоушена (см. зависимость). Профиль всё
   равно клампится и гейтится server-side — превью в офисе лишь предсказывает результат.

### Мандат и граница (важно)

Офис теперь может **инициировать** промоушен, но остаётся тонким клиентом — **не исполняет и не
решает**:
- **Офису можно:** скомпоновать профиль, показать пресеты, посчитать/отрисовать превью клампа
  (чистая функция, зеркалит `clampRiskProfile` платформы, без сети/БД), и по подтверждению
  **отправить запрос** на платформенный write-endpoint.
- **Офису нельзя:** самому принимать торговые решения, обходить платформенные гейты, писать в БД
  платформы напрямую, держать execution-логику. Вся валидация/кламп/admission/smoke — на платформе.
- **Требования к действию:** authZ + аудит-след + confirmation-UX (переиспользовать operator-auth
  #18 и operator-confirmation UI #12–14), идемпотентность запроса.

### Зависимость на платформе (prerequisite)

Сейчас write на платформе есть только через ops-CLI (`repromote_bundle.ts`). Для сабмита из офиса
нужен **платформенный write-endpoint промоушена** с теми же гейтами (guardrails-кламп 086,
admission, smoke, desired-state журнал), напр. HTTP поверх логики `buildRepromotedBundle` /
promoting-intake. **Пока endpoint не появился** — деградировать до экспорта: кнопки «скопировать
risk-profile JSON» и «скопировать команду `repromote --risk-json … --clamp`», чтобы оператор
применил вручную. Endpoint — отдельная задача в `trading-platform`, здесь фиксируется как блокер
полного UX.

### Платформенные контракты для потребления (репо `trading-platform`, кросс-репо)

Всё уже реализовано и в `main` платформы. Конфигуратору нужно **зеркалить формы и логику клампа**
для превью (значения ниже — ориентир; при реализации свериться с кодом, не хардкодить вслепую):

- **Пресеты (085)** — `src/promotion/risk_presets.ts`: `RISK_PRESET_NAMES =
  ['conservative','default','aggressive']`; `resolveRiskPreset(name, env)`. Форма риска
  (stops/hold/dca) фиксирована на пресет; базовый ордер = `PROMO_BASE_ORDER_USD` (дефолт 100) ×
  множитель (conservative 0.5×, default 1×, aggressive 2×); `dca1 = 1.2×base`, `dca2 = 1.5×base`.
  Формы: conservative `{tp1 3, tp2 4, hardStop 8, maxHold 120, dca 1/4}`, default
  `{tp1 3.5, tp2 5, hardStop 12, maxHold 180, dca 2/3}`, aggressive `{tp1 4, tp2 6, hardStop 15,
  maxHold 240, dca 2/2.5}`.
- **Guardrails + кламп (086)** — `src/promotion/guardrails.ts`: `defaultGuardrails(env)` →
  `{ maxBaseOrderUsd 500 (GUARDRAIL_MAX_ORDER_USD), hardStopPctMin 2, hardStopPctMax 20,
  maxHoldMinCap 480, tpPctMin 0.1, minDropPctMin 0.1, dcaMaxCountCap 3 }` (все env-override).
  `clampRiskProfile(risk, guardrails) → { risk, clamps: {field, from, to}[] }` — зажим каждого
  поля в границы; инвариант `tp2 ≥ tp1`; идемпотентно; `clamps` — только реально зажатые поля.
  **Эту чистую функцию офис зеркалит для live-preview** (портировать 1:1 в TS-утилиту — она без I/O).
- **Форма RiskProfile** (`src/contracts/config/risk-profile.ts` + `src/types/config.ts`):
  ```ts
  {
    sizing: { baseOrderUsd: number; dca1OrderUsd?: number; dca2OrderUsd?: number };
    stops:  { tp1Pct: number; tp2Pct: number; hardStopPct: number; maxHoldMin: number; moveStopToBEAfterTp1?: boolean };
    dca:    { maxCount: number; minDropFromLastEntryPct: number };
  }
  ```
- **proposedRiskProfile (087/088)** — платформа принимает предложенный (недоверенный) профиль в
  submission (`@trdlabs/sdk` intake-DTO, поле `proposedRiskProfile`) и **сама клампит** его в
  guardrails на промоушене. Даже «сырой» профиль будет зажат; превью в офисе — предсказание клампа.
- **repromote CLI (084)** — `scripts/ops/repromote_bundle.ts`: `--preset <name>` |
  `--risk-json <json|@file>` (+ опц. `--clamp`) — текущий операторский write-путь (fallback до
  появления endpoint), и эталон гейтов для будущего write-endpoint.

### Ориентир по реализации (черновые слайсы)

1. Портировать `clampRiskProfile` + `defaultGuardrails` + формы пресетов в client-side TS-утилиту
   офиса (чистые функции, юнит-тесты против значений платформы) — общий код в `packages/`.
2. React-панель: дропдаун пресетов → форма секций → live-preview клампа (список `field: from → to`).
3. **Применение:** если платформенный write-endpoint готов — сабмит через него (с authZ + подтв. +
   аудитом); иначе fallback-экспорт (копировать JSON / команду CLI).
4. Параллельно (в `trading-platform`) — write-endpoint промоушена с гейтами repromote (блокер п.3).

### Заметки

- До этого офис не касался write вообще (только read-surfaces). Это первая write-точка — тем важнее
  держать границу: офис инициирует, платформа гейтит/исполняет.
- Стек фронта: React 19 + Vite + PixiJS (`apps/web`). Панель — обычный React-компонент вне
  Pixi-канваса (конфигуратор — форма, не спрайты).
- Соблюдать `AGENTS.md`: русская документация/вопросы, границы workspaces, `verify:assets` зелёный,
  authZ/аудит/подтверждение для действий.

---

## Кросс-репо инициативы

Канонический статус — в control-center [реестре инициатив](../control-center/docs/delivery/cross-repo-initiatives.md); локально не дублируем (правило реестра).

- [env-catalog](../control-center/docs/delivery/initiatives/env-catalog.md) — офисная часть (item 5) **сделана**: типизированная env-схема `apps/server/src/env.ts` (zod; единственная точка чтения `process.env`; fail-fast на старте со списком всех невалидных переменных разом), машинный экспорт `npm run -s env:schema` → документ `env-schema.1` (repo `trading-office`, 42 переменные, включая build-time `VITE_*` и declaration-only `OFFICE_IMAGE_TAG`/`ULPC_DIR`), генерация `ENV.md` и `.env*.example` из схемы (`npm run env:docs`). Гейты «Полнота схемы» (`envCompleteness.test.ts`: `process.env` вне `env.ts` — красный CI) и «Генерация» (`envDocs.test.ts`: дрейф артефактов — красный CI) живут в тестовом прогоне. Fail-closed гейт #32 не ослаблен: `OFFICE_OPERATOR_PASSWORD` в схеме `required:false + secret:true` (standalone/fixture без него легален), авторитетный connected-гейт остаётся в `loadConfig` (`apps/server/src/config.ts`).
- [security-edge-hardening](../control-center/docs/delivery/initiatives/security-edge-hardening.md) — `proposed`. Офисная часть: office-server стартует БЕЗ auth по умолчанию (guard монтируется только при заданном `OFFICE_OPERATOR_PASSWORD` — `apps/server/src/config.ts:96`, `app.ts:58`), а на VPS через lab-compose публикуется на `0.0.0.0:8787` с серверными platform-read/lab-chat токенами → любой, кто дотянулся до порта, инициирует действия без операторских кредов; `/operator/confirm` минует human-in-the-loop и не имеет `assertNoExecutionAuthority` (`app.ts:95`). Сделать fail-closed в connected-режиме + authority-guard на confirm + дефолт `BIND_ADDR=127.0.0.1`. Аудит: control-center [`docs/analysis/08-security-boundary-audit.md`](../control-center/docs/analysis/08-security-boundary-audit.md).
