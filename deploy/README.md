# Deploy: Trading Office demo (Docker)

Runs the two published GHCR images — `trading-office-server` (office API + WS)
and `trading-office-web` (static UI via nginx) — with operator authentication
enabled.

## Quick start (local)

```bash
cp deploy/.env.example deploy/.env
# edit deploy/.env → set OFFICE_OPERATOR_PASSWORD
docker compose -f deploy/docker-compose.yml up
```

Then open **http://localhost:8080**, knock on the tower door, and sign in with
the password you set. A wrong password is rejected; only a correct one issues a
session token and lets you onto the floor.

- Web UI: http://localhost:8080
- Office API: http://localhost:8787 (the web image is baked to call it here)
- Server runs in **fixture mode** (no trading-lab needed); the floor shows
  fixture agents with live status ticks. Auth is enforced because a password is
  set.

Smoke the API directly:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8787/api/office/agents/statuses            # 401 (no token)
TOKEN=$(curl -s -X POST http://localhost:8787/api/office/operator/login \
  -H 'content-type: application/json' -d '{"password":"<your-pass>"}' | jq -r .token)
curl -s -o /dev/null -w '%{http_code}\n' -H "authorization: Bearer $TOKEN" \
  http://localhost:8787/api/office/agents/statuses                                                    # 200
```

## Auth model

- `OFFICE_OPERATOR_PASSWORD` **enables** auth. Unset/empty ⇒ the API is open
  (no login required) — fine for a throwaway local run, not for anything
  exposed.
- The password is verified server-side (constant-time); the server returns a
  stateless HMAC session token. REST calls send `Authorization: Bearer`; the
  WebSocket upgrade carries `?access_token` (browsers can't set WS headers).
- Tune with `OFFICE_AUTH_SECRET` (HMAC key, defaults to the password) and
  `OFFICE_AUTH_TTL_MS` (default 12h).

## Remote / non-localhost deploys

The **web image bakes** `VITE_OFFICE_GATEWAY_URL=http://localhost:8787` at build
time, so the browser always calls the API at `localhost:8787`. That only works
when the browser runs on the same host. For a public origin you must **rebuild
the web image** pointing at the public API origin, and set the server's CORS to
the public web origin:

```bash
docker build -f apps/web/Dockerfile \
  --build-arg VITE_OFFICE_MODE=connected \
  --build-arg VITE_OFFICE_GATEWAY_URL=https://office-api.example.com \
  -t your-registry/trading-office-web:custom .
# and run the server with OFFICE_CORS_ORIGIN=https://office.example.com
```

## Connected (trading-lab) mode — optional

To back the floor with a real trading-lab instead of fixtures, add to the
server service environment:

```yaml
OFFICE_CONNECTOR_MODE: "trading-lab"
TRADING_LAB_READ_URL: "http://trading-lab:3100"
TRADING_LAB_READ_TOKEN: "..."
TRADING_LAB_CHAT_URL: "http://trading-lab:3000"
TRADING_LAB_CHAT_TOKEN: "..."
```

These are server-only and must never be exposed to the browser. See
`apps/server/.env.example` for the full list of knobs.
