# Phase 1 Acceptance Guide

## Commands

```sh
cp .env.example .env
# Review and keep the demo values local only.
docker compose up --build -d
docker compose ps
node tests/phase1-static.mjs
node tests/acceptance-phase1.mjs
```

For the browser SSO test, install the `tests` package dependencies and Chromium, then run:

```sh
cd tests
npm install
npx playwright install chromium
node sso.playwright.mjs
```

## Permission expectations

| Actor | Expected operation | Expected result |
|---|---|---:|
| `stu.ict1` | GET `/api/resources/student` | 200 |
| `stu.ict1` | GET `/api/resources/admin` | 403 |
| `leader.ict` | Reset `stu.ict1` password | 200 |
| `leader.ict` | Reset `stu.ec1` password | 403 |
| `leader.ict` | Delete `stu.ict1` | 403 |
| `admin.priya` | Delete a throwaway user | 200 |
| `ro.audit` | PUT any user | 403 |

JWT validation checks require signature, `RS256`, exact issuer, `portal-api` audience, and expiry. Failed state-changing requests are recorded in the application audit table with a result and reason. Keycloak native user/admin events remain separately retrievable at `/api/audit/keycloak`.

## Test-only controls

`iam-test-cli` has password/direct grants only to make local API tests deterministic. It is labelled TEST ONLY in the realm and disabled by `keycloak/scripts/remediate.sh`. Never enable it in production. All values in `.env.example` are demonstration values.
