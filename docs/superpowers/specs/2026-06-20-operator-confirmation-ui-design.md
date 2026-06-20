# Conversational-operator confirmation in the office UI

**Status:** Approved design (brainstormed 2026-06-20).
**Date:** 2026-06-20
**Repos:** `trading-office` (driver) + `trading-lab` (one coordinated prerequisite PR).
**Builds on:** trading-lab conversational operator (Slice 1 confirmation core, Slice 2 operator RAG) and the office Slice 3 completion-replies wiring.

## 1. Problem

A strategy message sent through the office chat UI hangs on `THINKING…` forever — no reply, no error.

Root cause (verified live + in code): the trading-lab conversational operator returns `kind: 'assistant_message'` (interpretation text + evidence cards + `confirm`/`cancel` actions + `pendingInteractionId`) as turn 1 of every strategy/research proposal. But the office side never learned about it:

- `apps/server/src/connector/tradinglab/labDtos.ts` — `LabChatResponse` (hand-mirrored from the lab) has **no `assistant_message` variant** (it predates Slice 1/2; only Slice 3 completion-summary touched the office).
- `apps/server/src/operator/TradingLabOperatorResponder.ts` — `runTurn`'s `switch (resp.kind)` has cases for `task_created | task_status | needs_clarification | out_of_scope | capability_not_available | help | rejected | error` but **no `assistant_message` case**. Because the DTO type omits the kind, TypeScript's exhaustiveness check did not flag the gap.

At runtime the lab sends `assistant_message`, the switch matches nothing, `runTurn` returns without emitting `operator_message_completed` or `operator_message_failed`, and the web (which renders `THINKING` until a terminal WS event arrives) hangs forever. The lab backend is correct — the conversational-operator two-turn confirmation flow was simply never wired into the office UI.

## 2. Goal & scope

Wire the conversational-operator proposal + confirmation into the office so the two-turn flow works in the browser: the user sees the proposal (interpretation + compact evidence), clicks **Подтвердить / Отмена**, and the deterministic enqueue happens in the lab.

Delivered as three ordered, independently-green PRs:

- **PR-L (trading-lab):** a structured confirm endpoint so the office can resolve a proposal by id.
- **PR-O1 (trading-office server):** teach the office DTO + responder about `assistant_message`, and add the confirm round-trip.
- **PR-O2 (trading-office web):** render compact, clickable evidence cards + confirm/cancel buttons; clicking a card opens a left-sidebar panel with the evidence we already have.

### Non-goals (explicit)

- **Rich evidence details (fast-follow slice).** Lab evidence cards carry only `sourceId` (= `strategyProfileId`), audit-safe, with no strategy text. Showing a clicked card's full profile (core idea / direction / status) needs a new trading-lab read endpoint (profile-by-id) + office read wiring + a richer panel. This slice makes cards clickable and opens the sidebar with **only the evidence already in hand** (kind, sourceId, similar-count, warning codes). The profile lookup is a separate follow-up slice.
- Multi-turn free-form conversation memory, streaming token deltas for the proposal, or confirm-by-typed-"да" (we use structured confirm instead).
- Any execution authority. The office never trades; confirm only triggers the lab's research enqueue.

## 3. Approved decisions

1. **Structured confirm by `pendingInteractionId`** (not a typed "да" message). Clicking a button calls a dedicated lab endpoint with the proposal id.
2. **`sessionId` is round-tripped, not threaded.** `confirmPending(id, sessionId, now)` in the lab validates the session (a mismatched session → `not_found`; this is the security/correlation check that only the creating session may confirm). The `assistant_message` already carries `sessionId`; the web holds `{ sessionId, pendingInteractionId }` from the proposal and returns both on confirm. No persistent cross-turn session is introduced.
3. **Compact, clickable evidence cards.** Badges: `⚠ точный дубликат` (exact_duplicate), `N похожих` (similar count), warning codes. Clicking opens a left-sidebar panel rendering the evidence we have. No profile fetch (see non-goals).
4. **Reuse the existing async WS event model.** The proposal arrives as an `operator_message_completed` reply extended with `evidence` / `actions` / `pendingInteractionId` / `sessionId`. The confirm outcome (`task_created`) flows through the existing `task_created` → progress + `ConversationFollower` path.

## 4. Architecture

### Part A — trading-lab: structured confirm endpoint (PR-L)

- New route `POST /chat/confirm`, behind the existing chat bearer gate (`TRADING_LAB_CHAT_TOKEN`, same fail-closed `chatAuthMiddleware`).
- Request (Zod-validated): `{ pendingInteractionId: string, sessionId: string, decision: 'confirm' | 'cancel' }`.
- `decision: 'confirm'` → `repo.confirmPending(pendingInteractionId, sessionId, now)`:
  - `confirmed_now` → `createAndEnqueueTask(...)` (the single Slice-1 chokepoint) → respond `task_created` (same `ChatResponse` shape as the typed-"да" path).
  - `already_confirmed` → idempotent: respond `task_created` / `task_status` for the existing task, no second enqueue.
  - `not_found` (wrong session, cancelled, or unknown id) / `expired` → respond `rejected` with a stable reason code.
- `decision: 'cancel'` → the existing cancel path (mark the proposal cancelled) → respond a small terminal message (`task_status`/`assistant_message` "отменено").
- Pure additive: no migration, no new domain event, reuses `confirmPending` + `createAndEnqueueTask`. Confirmation-before-interpretation invariant preserved (the LLM is never re-invoked; the deterministic guard resolves the stored proposal).

### Part B — trading-office server (PR-O1)

- **`labDtos.ts`:** add the `assistant_message` variant to `LabChatResponse`:
  `{ kind: 'assistant_message'; sessionId: string; message: string; evidence: LabEvidenceCard[]; actions: LabAction[]; pendingInteractionId?: string }`, plus `LabEvidenceCard` (`kind: 'interpretation'|'exact_duplicate'|'similar'|'warning'; text: string; sourceId?: string`) and `LabAction` (`id: 'confirm'|'cancel'; label: string; style: 'primary'|'secondary'`). The confirm endpoint returns the existing `LabChatResponse` union (reused).
- **`TradingLabChatConnector`:** add `confirm(args: { pendingInteractionId; sessionId; decision }): Promise<LabChatResponse>` → `POST /chat/confirm` (same `requestTimeoutMs`, same bearer).
- **Event model:** extend `OperatorReply` (and the `operator_message_completed` payload) with optional `evidence?: OfficeEvidenceBadge[]`, `actions?: OfficeAction[]`, `pendingInteractionId?: string`, `sessionId?: string`. `OfficeEvidenceBadge` is the office-facing compact projection (kind + label + optional sourceId); raw lab text/ids only, never strategy bodies.
- **`runTurn`:** add `case 'assistant_message'` → `completed(resp.message, { evidence: toBadges(resp.evidence), actions: resp.actions, pendingInteractionId: resp.pendingInteractionId, sessionId: resp.sessionId })`. The turn is terminal (proposal shown); confirmation is a new interaction.
- **Confirm route + bus method:** a new office endpoint (`OFFICE_API.operatorConfirm`) accepting `{ pendingInteractionId, sessionId, decision }` → calls `connector.confirm(...)` → maps the response exactly like the existing `task_created` arm of `runTurn` (emit a fresh interaction's `accepted` → `progress('task_created', …)` → `startFollow(...)`), so the post-confirm completion reply (Slice 3) still fires. The other `LabChatResponse` kinds map as in `runTurn`: `rejected`/`error` → `failed`; `task_status` → its terminal/active mapping.
  - **Important (confirmed against shipped PR-L behaviour):** the lab returns a graceful **`assistant_message`** for a stale/unknown/expired or cancelled confirm — `not_found` ("Не нашёл активного подтверждения…"), `expired` ("Срок подтверждения истёк…"), and `cancel` ("Отменил…") all come back as `assistant_message`, **not** as `rejected`. The confirm route must therefore treat an `assistant_message` outcome (with no further `actions`) as **terminal**: emit `completed(resp.message)` so the user sees the reason — never await a `rejected` kind that will not arrive, and never re-render confirm/cancel buttons for it.
- **Guard:** `assertNoExecutionAuthority` continues to apply; confirm only reaches the research enqueue.

### Part C — trading-office web (PR-O2)

- **`operatorTranscript` reducer:** carry `evidence`, `actions`, `pendingInteractionId`, `sessionId`, and a per-turn `resolved` flag from the `completed` event onto the `OperatorTurn`.
- **`ChatTurn`:** when `actions` are present and the turn is unresolved, render the proposal text + compact, **clickable** evidence badges + **Подтвердить / Отмена** buttons.
  - Badge click → open the left-sidebar evidence panel (a new panel in the existing `PanelDock` / `panelRegistry` system) showing the evidence we have (kind, sourceId, similar count, warning codes). No network call.
  - Confirm/Cancel click → `gateway.confirmAction({ pendingInteractionId, sessionId, decision })`; mark the turn `resolved` (buttons disabled), append the outcome (the new interaction's events render as the next assistant line).
- **Gateway:** add `confirmAction(...)` to the office gateway (HTTP + mock), POSTing to `OFFICE_API.operatorConfirm`.

## 5. Data flow (happy path)

1. User sends a strategy → web `sendOperatorMessage` → office `operatorMessages` route → `runTurn` → lab `POST /chat/messages` → `assistant_message`.
2. `runTurn` emits `operator_message_completed` with text + badges + actions + `{ sessionId, pendingInteractionId }`. Web renders the proposal + clickable badges + buttons.
3. User clicks **Подтвердить** → web `confirmAction({ pendingInteractionId, sessionId, decision:'confirm' })` → office `operatorConfirm` route → `connector.confirm` → lab `POST /chat/confirm` → `confirmPending` → `createAndEnqueueTask` → `task_created`.
4. Office maps `task_created` → `accepted`/`progress`/`startFollow`; the `ConversationFollower` later posts the completion-summary reply (existing Slice-3 behaviour). Web appends the outcome line.

## 6. Error handling

- Lab chat/confirm error or timeout → office emits `operator_message_failed` (existing path) → web renders the error bubble (no infinite THINKING). The `assistant_message` case itself is now terminal, which is the core fix.
- `not_found`/`expired` confirm (stale proposal, double-click after expiry) → lab `rejected` → office `failed` with a stable reason → web shows "предложение истекло/не найдено".
- `already_confirmed` → idempotent `task_created` for the existing task; the web disables buttons on first click so a double-click is also guarded client-side.
- Cancel → terminal "отменено" reply; buttons disabled.

## 7. Invariants

- **No execution authority** in the office (`assertNoExecutionAuthority`); confirm only reaches the lab research enqueue.
- **Confirmation before interpretation** (lab): `POST /chat/confirm` never re-invokes the LLM; it resolves the stored proposal deterministically via `confirmPending`.
- **Hand-mirrored DTOs**: the office does not import any trading-lab package; `labDtos` declares only the fields the office reads.
- **Audit-safe evidence**: badges/panel carry kinds, labels, counts, codes, and `sourceId`s only — never strategy text or embeddings.
- **Single enqueue chokepoint**: confirm goes through `createAndEnqueueTask`; no new enqueue path.
- Office runtime unchanged elsewhere; `assistant_message` is additive to the DTO + switch.

## 8. Testing contract

- **PR-L:** `confirm` → `confirmed_now` → `task_created`; `already_confirmed` → idempotent (no second enqueue); wrong session / unknown id → `not_found` → `rejected`; `expired` → `rejected`; `cancel` → cancelled terminal. Endpoint integration through the chat app (auth gate: unset token → 503; bad bearer → 401).
- **PR-O1:** `runTurn` `assistant_message` → `completed` carrying badges + actions + `{ sessionId, pendingInteractionId }`; confirm route → `connector.confirm` called with the right args → `task_created` → follower started; `rejected`/error → `failed`; cancel → terminal. Connector `confirm` posts to `/chat/confirm` with bearer + timeout.
- **PR-O2:** transcript reducer carries evidence/actions/pendingInteractionId/sessionId + `resolved`; `ChatTurn` renders badges + buttons on an unresolved proposal turn; badge click opens the sidebar panel; confirm click calls `gateway.confirmAction` and disables buttons; failed/expired renders the error bubble.

## 9. Sequencing / rollout

PR-L → PR-O1 → PR-O2, each green-gated. PR-L ships an additive endpoint (inert until the office calls it). PR-O1 unsticks THINKING (proposal renders) and enables confirm server-side. PR-O2 lands the buttons + clickable badges. No feature flag required; the change is additive and the prior office behaviour (task_created/status/etc.) is untouched.
