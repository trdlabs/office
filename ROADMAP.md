# ROADMAP — trading-office

Дорожная карта офиса. Пункты пишем с достаточным контекстом, чтобы отдельный агент/инстанс
мог взять задачу без дополнительного разбора соседних репозиториев.

---

## 🔜 Risk-конфигуратор промоушена (стиль Hummingbot)

**Статус:** запланировано, не начато. Последний пункт фронта `#profile-management` (платформенная
часть закрыта — см. ниже). Задача предполагает отдельный инстанс Claude Code, запущенный в
`trading-office`.

### Что хотим

UI-панель «конфигуратор риска» в веб-офисе (`apps/web`, React 19 + Vite + PixiJS): оператор
подбирает risk-профиль стратегии в наглядной форме (в духе Hummingbot-конфигуратора), а офис
показывает, **что с этим профилем сделает платформа** до фактического применения:

1. **Дропдаун именованных пресетов** — `conservative | default | aggressive` (контракт платформы
   085, см. ниже). Выбор пресета заполняет форму.
2. **Форма risk-профиля** — секции `sizing / stops / dca` (полная форма ниже).
3. **Live-preview клампа guardrails** — по мере правки офис локально считает, какие поля выйдут
   за платформенные границы (контракт 086), и показывает «было → станет» (`ClampRecord`), т.е.
   ровно то, что платформа зажмёт на промоушене. Это делает невидимую политику безопасности
   видимой оператору ещё до сабмита.

### ⚠️ ГЛАВНОЕ ограничение — office read-only (no execution authority)

По `AGENTS.md` офис **только читает** состояние внешних систем и рисует его; **никакой записи/
исполнения**. Конфигуратор, который сам **сабмитит** профиль в intake платформы, нарушил бы этот
принцип. Поэтому границу нужно провести явно (обсудить с владельцем перед реализацией):

- **Разрешено офису (read-only, client-side):** скомпоновать профиль, показать пресеты, посчитать
  и отрисовать превью клампа (чистая функция, зеркалит `clampRiskProfile` платформы — без сети/БД).
- **НЕ офису (write):** фактический сабмит/промоушен. Артефакт конфигуратора — это **JSON risk-
  профиля / выбранный пресет**, который оператор применяет write-путём платформы:
  `repromote_bundle.ts --preset <name>` / `--risk-json @profile.json [--clamp]` (контракт 084/086),
  либо будущий write-endpoint платформы. Офис может максимум дать «скопировать JSON / команду».

**Решение о точной границе — за владельцем.** Возможные трактовки: (a) чистый визуализатор+превью
(export JSON, оператор сам применяет CLI); (b) если появится платформенный write-surface — офис
как тонкий клиент к нему (но это уже пересматривает read-only мандат и требует явного согласия).

### Платформенные контракты для потребления (репо `trading-platform`, кросс-репо)

Всё уже реализовано и в `main` платформы. Конфигуратору нужно **зеркалить формы и логику клампа**
(значения ниже — источник истины; при реализации свериться с кодом, не хардкодить вслепую):

- **Пресеты (085)** — `src/promotion/risk_presets.ts`: `RISK_PRESET_NAMES =
  ['conservative','default','aggressive']`; `resolveRiskPreset(name, env)`. Форма риска
  (stops/hold/dca) фиксирована на пресет; базовый ордер = `PROMO_BASE_ORDER_USD` (дефолт 100) ×
  множитель (conservative 0.5×, default 1×, aggressive 2×); `dca1 = 1.2×base`, `dca2 = 1.5×base`.
  Формы пресетов: conservative `{tp1 3, tp2 4, hardStop 8, maxHold 120, dca 1/4}`, default
  `{tp1 3.5, tp2 5, hardStop 12, maxHold 180, dca 2/3}`, aggressive `{tp1 4, tp2 6, hardStop 15,
  maxHold 240, dca 2/2.5}`.
- **Guardrails + кламп (086)** — `src/promotion/guardrails.ts`: `defaultGuardrails(env)` →
  `{ maxBaseOrderUsd 500 (GUARDRAIL_MAX_ORDER_USD), hardStopPctMin 2, hardStopPctMax 20,
  maxHoldMinCap 480, tpPctMin 0.1, minDropPctMin 0.1, dcaMaxCountCap 3 }` (все env-override).
  `clampRiskProfile(risk, guardrails) → { risk, clamps: {field, from, to}[] }` — зажим каждого
  поля в границы; инвариант `tp2 ≥ tp1`; идемпотентно; `clamps` перечисляет только реально
  зажатые поля. **Именно эту чистую функцию офис зеркалит для live-preview** (можно портировать
  1:1 в TS-утилиту офиса — она без I/O).
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
  guardrails на промоушене. То есть даже если офис отдаёт «сырой» профиль, платформа его зажмёт;
  превью в офисе — это UX-предсказание того же клампа.
- **repromote CLI (084)** — `scripts/ops/repromote_bundle.ts`: `--preset <name>` |
  `--risk-json <json|@file>` (+ опц. `--clamp`) — операторский write-путь применения профиля к
  бандлу без ре-авторства.

### Ориентир по реализации (черновые слайсы)

1. Портировать `clampRiskProfile` + `defaultGuardrails` + формы пресетов в client-side TS-утилиту
   офиса (чистые функции, покрыть юнит-тестами против значений платформы) — общий код в `packages/`.
2. React-панель: дропдаун пресетов → форма секций → live-preview клампа (список `field: from → to`).
3. Экспорт результата: кнопки «скопировать risk-profile JSON» и «скопировать команду
   `repromote --risk-json ... --clamp`». Никакого сетевого сабмита из офиса.
4. (Обсудить с владельцем) нужен ли реальный write-путь и где ему жить, если да.

### Зависимости и заметки

- Офис пока вообще не интегрирован с платформенным intake/промоушеном (сейчас только read-surfaces
  Ops Read / Research Read). Это первая точка, где офис касается risk-домена — тем важнее не
  протащить write-логику в read-only приложение.
- Стек фронта: React 19 + Vite + PixiJS (`apps/web`). Панель может быть обычным React-компонентом
  вне Pixi-канваса (конфигуратор — это форма, не спрайты).
- Соблюдать `AGENTS.md`: русская документация/вопросы, границы workspaces, `verify:assets` зелёный.
