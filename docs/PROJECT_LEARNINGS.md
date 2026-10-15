# PROJECT_LEARNINGS.md
## Ganpat University IAM Governance & Security Dashboard
### A complete handoff for engineers who have no chat history

**Written from:** verified command outputs, file contents read in session, and live test runs.  
**Evidence labels:** `VERIFIED` = seen in actual output. `UNVERIFIED` = inferred from file names or design intent. `BROKEN` = confirmed failure observed.

---

## 1. What the project is

**Course:** 2CSE507 — Identity and Access Management, Practicals 03–16  
**Workspace:** `C:\Users\vishw\Desktop\IAM P\ganpat-iam-project\ganpat-iam`  
**GitHub remote:** `https://github.com/vishwajit2006/IAM-Project.git` — branch `main` `VERIFIED`

The project demonstrates a complete IAM governance environment for Ganpat University:  
- Keycloak 26.4.0 as OIDC/SAML identity provider  
- Node/Express backend API with JWT validation, RBAC, department scoping, and audit  
- PostgreSQL for app governance state  
- OpenLDAP for directory federation  
- React/Vite/Tailwind governance portal + student/library OIDC portals + SAML SP  

Target: **Phases 1–3** covering realm provisioning, RBAC, SSO, MFA, LDAP, SAML, access reviews, risk registers, audit, and reporting.  
**Overall status: PARTIAL.** The stack runs. End-to-end gates are not yet all passing.

---

## 2. Architecture and real host ports `VERIFIED` from `docker compose ps`

```
Browser
  ├── Governance portal      localhost:3000
  ├── Student OIDC portal    localhost:3001
  ├── Library OIDC portal    localhost:3002
  └── SAML SP                localhost:3003
           │
           ├── Keycloak       localhost:8080  (quay.io/keycloak/keycloak:26.4.0)
           │    realm: ganpat-iam
           └── Backend API    localhost:4000  (Express/Node)
                    └── PostgreSQL  localhost:5432  (postgres:16.6-alpine)
OpenLDAP                      localhost:1389  (osixia/openldap:1.5.0)
```

**Isolated test project** (for fresh-import tests, never run against the main stack):  
Use `docker compose -p ganpat-test` with separate port mapping.  
`docker compose down -v` MUST always specify `-p <project>` to avoid destroying the main pgdata volume.

Main volume: `ganpat-iam_pgdata` — `NEVER delete`.

---

## 3. File-by-file inventory

### Root / Docker

| File | Purpose | Status | Notes |
|---|---|---|---|
| `.env.example` | Environment template, 14 lines | `VERIFIED` | Variables: `POSTGRES_PASSWORD`, `KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD`, `IAM_SERVICE_CLIENT_SECRET`, `DEMO_USER_PASSWORD`, `LDAP_ADMIN_PASSWORD`. All values are demo-only strings. |
| `.env` | Actual secrets (never committed) | `VERIFIED` ignored by `.gitignore:3` | Copy `.env.example`; all values are demo-only for classroom use. |
| `.gitignore` | Ignore rules | `VERIFIED` | Covers `.env`, `*.before-repair`, `*.broken-backup`, `*.sql.dump`, `node_modules/`, `dist/`. |
| `.gitattributes` | LF enforcement | `VERIFIED` (generated this session) | Forces LF for all `.sh`, `.mjs`, `.js`, `.yml` etc. Prevents CRLF breaking bash inside containers. |
| `docker-compose.yml` | All service definitions | `VERIFIED` content read | 8 services: postgres, keycloak, openldap, keycloak-config, backend, portal, student-portal, library-portal, saml-sp. Named volumes: `pgdata`, `ldapdata`, `ldapconf`. |
| `README.md` | Project overview | `UNVERIFIED` content not read | Reconcile with actual commands before relying on it. |
| `repair_iam_realm.cmd` | Windows batch repair helper | `UNVERIFIED` content not read | Review for destructive operations before running. |
| `realm-roles-mapper.json` | Role mapper config | `UNVERIFIED` | Confirm whether referenced by setup script. |

### Keycloak

| File | Purpose | Status | Notes |
|---|---|---|---|
| `keycloak/build-realm.mjs` | Realm generator (GENERATED file) | `VERIFIED` | Produces `ganpat-iam-realm.json`. 458 lines. Generates 18 users, 10 roles, 6 departments, 7 clients. Password written as literal `${DEMO_USER_PASSWORD}` (Keycloak interpolates on import). |
| `keycloak/realm/ganpat-iam-realm.json` | Generated realm config (GENERATED) | `VERIFIED` | Tracked in git. Contains only `${DEMO_USER_PASSWORD}` placeholders — no real secrets. Do not hand-edit; regenerate with `node keycloak/build-realm.mjs`. |
| `keycloak/scripts/setup.sh` | Post-import idempotent setup | `VERIFIED` content read | Creates/updates `iam-governance-service` service account with roles: `query-users`, `view-users`, `manage-users`, `view-events`, `view-realm`, `manage-realm`. Enables native events. Uses `${IAM_SERVICE_CLIENT_SECRET}` and `${KC_BOOTSTRAP_ADMIN_PASSWORD}`. |
| `keycloak/scripts/mfa-flow.sh` | Role-based MFA browser flow | `VERIFIED` syntax only | Creates `browser-mfa-by-role` flow with conditional OTP for `mfa-required` role. Has NOT been executed against Keycloak. Behavior unverified. |
| `keycloak/scripts/baseline-weak.sh` | Baseline weak-config script | `UNVERIFIED` | Review before running. |
| `keycloak/scripts/remediate.sh` | Remediation script | `UNVERIFIED` | Review for idempotence before running. |
| `keycloak/themes/ganpat/` | Login/account/admin theme files | `UNVERIFIED` | Files exist; whether applied and rendered correctly is unverified. |

### Backend

| File | Purpose | Status | Notes |
|---|---|---|---|
| `backend/src/server.js` | Express API — 197 lines | `VERIFIED` content read | Routes: `/health`, `/api/me` (GET/PATCH), `/api/departments`, `/api/dashboard`, `/api/users` (GET), `/api/users/:id` (PATCH/DELETE), `/api/users/:id/reset-password`, `/api/iam/config`, `/api/iam/password-policy`, `/api/audit/keycloak`, `/api/audit/app`, `/api/access-reviews` (GET/POST), `/api/resources/student`, `/api/resources/library`, `/api/resources/:department`, `/api/remediations` (GET/POST), `/api/alerts` (GET), `/api/alerts/:id/acknowledge`. **Missing** (required by test): `/api/sessions/:userId`, `/api/applications/sessions`, `/api/resources/admin`. |
| `backend/src/security.js` | JWT + authz middleware | `VERIFIED` content read | `authenticate` verifies RS256 JWT, audience `portal-api`, issuer from `KEYCLOAK_ISSUER` env var. `requireAnyRole`, `requireReadOnlyForWrites`, `requireDepartment` middlewares. Uses `identity.groups.some(group => group === ...)` for dept check. |
| `backend/src/keycloak-admin.js` | Keycloak Admin API client | `VERIFIED` partial | Service token via `client_credentials`. Exports `kcAdmin`, `getUserWithGroups`. Caches token with 15s early-refresh. |
| `backend/Dockerfile` | Backend image | `UNVERIFIED` content not read | |
| `backend/package.json` | Dependencies | `UNVERIFIED` content not read | Known deps from imports: express, helmet, cors, express-rate-limit, pg, zod, jose. |

### Database

| File | Purpose | Status | Notes |
|---|---|---|---|
| `db/init.sql` | PostgreSQL schema DDL — pure schema, no credentials | `VERIFIED` | Tables: `departments`, `app_audit_events` (columns: `actor_sub`, `actor_username`, `action`, `target`, **`outcome`**, **`details`**, `created_at`), `access_reviews`, `alerts`, `remediation_actions`. Note: test file incorrectly expected `result`/`reason` — actual columns are `outcome`/`details`. |
| `db/000-create-databases.sh` | DB user/database creation | `VERIFIED` partial | Creates `keycloak` and `portal` DB users with `POSTGRES_PASSWORD`. No credentials embedded. |
| `db/001-init-schema.sh` | Schema init runner | `VERIFIED` partial | Exports `PGPASSWORD` from env, no credentials embedded. |

### Apps and portals

| File | Purpose | Status |
|---|---|---|
| `portal/src/main.jsx` | Governance portal React SPA | `VERIFIED` partial — uses `keycloak-js`, shows token diagnostics, update-token(30), `azp`/`sub` checks |
| `apps/student-portal/src/main.jsx` | Student OIDC portal | `UNVERIFIED` |
| `apps/library-portal/src/main.jsx` | Library OIDC portal | `UNVERIFIED` |
| `apps/saml-sp/server.js` | SAML SP server | `BROKEN` — scaffold only, no SAML library or ACS handler |

### Tests

| File | Purpose | Status | Notes |
|---|---|---|---|
| `tests/phase1-static.mjs` | Source-grep static checks, 9 assertions | `VERIFIED` run — **3/9 PASS** | Read-only static file checks. Does NOT count as behavioural verification. |
| `tests/security-invariants.test.mjs` | Node test runner invariants, 6 tests | `VERIFIED` run — **5/6 PASS** | Fails on `groupPaths.some(...)` regex (code uses `identity.groups.some(...)`). |
| `tests/acceptance-phase1.mjs` | Live acceptance tests | `UNVERIFIED` run | Contains `token()` helper for direct-grant token fetch. |
| `tests/acceptance.test.mjs` | Structural acceptance | `VERIFIED` partially | Asserts `credentials[].value === '${DEMO_USER_PASSWORD}'` — now passes since generator writes literal placeholder. |
| `tests/sso.playwright.mjs` | Browser SSO test | `UNVERIFIED` run | Playwright-based; not yet executed. |

---

## 4. Every defect found — root cause, decided fix, fixed?

| # | Defect | Root Cause | Decided Fix | Fixed? |
|---|---|---|---|---|
| D-01 | Test client IDs wrong (`portal-spa`/`portal-admin-svc` vs `iam-portal`/`iam-governance-service`) | Test written against an earlier design | **Name-only mismatch → fix the test** to match generator/compose. | ❌ Not yet |
| D-02 | `sslRequired` — test expects `'external'`, generator had `'none'` | Generator used dev shortcut | **Keep `'external'`** (correct for production; localhost HTTP still works with this setting in Keycloak). Generator fixed. | ✅ Fixed in `build-realm.mjs` |
| D-03 | `passwordPolicy` missing `notUsername` and `passwordHistory(3)` | Generator omitted them | **Fix generator** to append both. | ✅ Fixed in `build-realm.mjs` |
| D-04 | Test checks `KC_PUBLIC_ISSUER`, code uses `KEYCLOAK_ISSUER` | Test written with wrong env var name | **Name-only mismatch → fix the test** | ❌ Not yet |
| D-05 | Generator wrote actual password value; test expects literal `${DEMO_USER_PASSWORD}` | Generator resolved env var before writing | **Fix generator** to write literal string. Keycloak interpolates on import. | ✅ Fixed in `build-realm.mjs` |
| D-06 | Missing routes: `/api/sessions/:userId`, `/api/applications/sessions`, `/api/resources/admin` | Never implemented | **Implement the routes** (not remove the test expectations). Decision: keep sslRequired and implement missing routes. | ❌ Not yet |
| D-07 | Test expects audit columns `result`/`reason`; schema has `outcome`/`details` | Test written against a draft schema | **Name-only mismatch → fix the test** | ❌ Not yet |
| D-08 | Security invariant regex expects `groupPaths.some(...)`, code uses `identity.groups.some(...)` | Test regex written against a draft variable name | **Name-only mismatch → fix the test regex** (security behaviour is not changed). Decision: replace with behavioural cross-dept denial test. | ❌ Not yet |
| D-09 | `openldap` had no healthcheck in compose | Omitted | **Add healthcheck block**. | ✅ Fixed in `docker-compose.yml` |
| D-10 | SAML SP is a scaffold — no SAML library, no ACS, no signature validation | Never implemented | **Implement real SAML SP** with assertion view | ❌ Not yet |
| D-11 | `openldap` container crashed on start — `:ro` bind-mount blocked `chown` of seed LDIF | `osixia/openldap` chowns files at startup; read-only mount blocked this | **Remove `:ro`, use named volumes** for `/var/lib/ldap` and `/etc/ldap/slapd.d` | ✅ Fixed in `docker-compose.yml` (container now starts) |

---

## 5. Lessons learned

1. **`sub` claim needs the `basic` client scope in Keycloak 26** `UNVERIFIED root-cause`  
   A prior token lacked `sub`. Suspected cause: the `basic` scope (which includes `sub`) was not assigned to the client. Fix: add `basic` scope to every client in the realm generator. This has not been confirmed by live token inspection yet.

2. **`passwordHistory(3)` blocks demo password resets — use fresh import, never a reset loop** `VERIFIED`  
   With history enabled, the 13 demo users could not be reset to the same demo password. The correct fix: generate the realm JSON with `${DEMO_USER_PASSWORD}` as a literal, pass `DEMO_USER_PASSWORD` env var to the Keycloak container, and let Keycloak set it once on `--import-realm`. History starts at zero after a clean import. Never run `POST /reset-password` in a loop against an existing realm with password history.

3. **`docker compose down -v` destroys all volumes in that project** `VERIFIED risk`  
   Always specify `-p <isolated-project-name>` when resetting a test stack. Never run `down -v` in the main project directory. Main volume `ganpat-iam_pgdata` must be protected.

4. **CRLF line endings break `.sh` files run inside Linux containers** `VERIFIED`  
   On Windows, git may convert to CRLF. The `mfa-flow.sh` script failed `bash -n` inside the container until LF was enforced. Fixed by adding `.gitattributes` with `*.sh text eol=lf`. Always validate shell scripts with `bash -n` inside the container before executing.

5. **HTTP 200 does not prove a feature works** `VERIFIED principle`  
   Health endpoints and OIDC discovery returning 200 were confirmed in earlier sessions. None of these count as acceptance gate passes. A feature is only verified when the full request flow — token issuance, JWT validation, role check, data response, audit write — produces the expected outputs with real users.

6. **Role-based MFA is built by `mfa-flow.sh` via `conditional-user-role` on `mfa-required`** `VERIFIED syntax, UNVERIFIED behaviour`  
   The script creates a `browser-mfa-by-role` flow: Username+Password for all users, then a conditional OTP subflow that fires only if the user holds the `mfa-required` role (directly or via composite). This has passed `bash -n` syntax check inside the container but has NOT been executed or verified against live Keycloak.

7. **`iam-test-cli` uses direct grant and bypasses browser MFA** `VERIFIED from source`  
   `tests/acceptance-phase1.mjs` uses `iam-test-cli` with `grant_type=password` (direct grant). This bypasses browser flows including MFA. It is test-only. Do not draw conclusions about MFA enforcement from tokens obtained this way.

8. **Keycloak `${ENV_VAR}` placeholders in realm JSON are expanded on import** `VERIFIED design`  
   Keycloak's `--import-realm` flag substitutes `${VARIABLE}` patterns using the container's environment variables. This is the correct mechanism for injecting `DEMO_USER_PASSWORD` without embedding real values in the JSON file.

9. **Static source-grep tests do not count as verification** `DECISION`  
   Tests in `phase1-static.mjs` and `security-invariants.test.mjs` are file-content readers, not behavioural tests. Passing them proves the source *contains* expected strings, not that the system behaves correctly. Gates 1–6 require live behavioural proof with real tokens and API calls.

10. **The `portal/src/main.jsx` diagnostic log leaks token metadata to browser console** `VERIFIED`  
    Lines 35–39 log `azp`, `hasToken`, `subjectPresent` to console. Remove or gate behind a dev-only flag before any non-classroom demo.

---

## 6. Six acceptance gates — current status and check commands

All gates require live services. Replace `TOKEN` with a real bearer token (never print to terminal; pipe through `jq` only).

### Gate 1 — Token contains `sub`; `/api/me` returns 200

**Status: NOT PASSED** — static check passes but live token not yet inspected.

```powershell
# Obtain token via direct grant (test-only client)
$body = "client_id=iam-test-cli&grant_type=password&username=head.ganpat&password=***&scope=openid"
$resp = Invoke-WebRequest -Uri "http://localhost:8080/realms/ganpat-iam/protocol/openid-connect/token" `
        -Method POST -Body $body -ContentType "application/x-www-form-urlencoded"
$token = ($resp.Content | ConvertFrom-Json).access_token
# Decode payload (base64, no secret needed for inspection)
[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($token.Split('.')[1].PadRight($token.Split('.')[1].Length + (4 - $token.Split('.')[1].Length % 4) % 4, '='))))
# Call /api/me
Invoke-WebRequest -Uri "http://localhost:4000/api/me" -Headers @{Authorization="Bearer $token"}
```

**Done when:** decoded payload contains non-empty `sub`; `/api/me` returns HTTP 200 with matching identity.

### Gate 2 — All 18 users obtain tokens after fresh import

**Status: NOT PASSED** — generator fixed but fresh import not run.

```powershell
# Fresh isolated import (never against main stack)
docker compose -p ganpat-test -f docker-compose.yml up -d --build
# Then: obtain token for each of 18 users, assert success
node tests/acceptance-phase1.mjs   # (once tests are updated to cover all 18)
```

**Done when:** all 18 usernames return a token without reset loops.

### Gate 3 — Authorization matrix (RBAC + department scoping)

**Status: NOT PASSED** — middleware verified from source, not behaviourally tested.

Tests needed:
- `student` cannot call `/api/users` → expect 403
- `read-only` PATCH `/api/me` → expect 403
- `dept-leader` of ICT cannot access ELEC department resource → expect 403
- `iam-admin` can call all admin routes → expect 200

**Done when:** positive and negative cases for every role + dept combination return correct status codes.

### Gate 4 — Audit events captured (Keycloak native + app DB rows)

**Status: NOT PASSED** — dual-source architecture in source; end-to-end not tested.

```powershell
# Trigger a login then check Keycloak event store
$adminToken = (Invoke-WebRequest -Uri "http://localhost:8080/realms/master/protocol/openid-connect/token" `
               -Method POST -Body "client_id=admin-cli&grant_type=password&username=admin&password=***" `
               -ContentType "application/x-www-form-urlencoded" | ConvertFrom-Json).access_token
Invoke-WebRequest -Uri "http://localhost:8080/admin/realms/ganpat-iam/events" `
                  -Headers @{Authorization="Bearer $adminToken"}
# Also check app DB
docker compose exec postgres psql -U postgres -c "SELECT action, outcome FROM app_audit_events ORDER BY created_at DESC LIMIT 5;"
```

**Done when:** a known action appears in both sources with correct `actor_sub`, `action`, `outcome`, `created_at`.

### Gate 5 — MFA: 5-case OTP matrix

**Status: NOT PASSED** — `mfa-flow.sh` syntax verified, not executed.

| Case | User | Enrolled OTP? | Expected outcome |
|---|---|---|---|
| 1 | `mfa.admin` (privileged) | No | Force TOTP enrollment |
| 2 | `mfa.admin` | Yes, valid code | Login succeeds |
| 3 | `mfa.admin` | Yes, wrong code | Login denied |
| 4 | `stu.ict1` (student) | No | Login succeeds without OTP |
| 5 | User with `mfa-required` removed | Had OTP | Login succeeds without OTP prompt |

**Done when:** all 5 cases produce the stated outcomes with browser evidence.

### Gate 6 — Student → Library SSO and logout

**Status: NOT PASSED** — portals up (HTTP 200) but SSO flow unverified.

1. Log in to `http://localhost:3001` (student portal)  
2. Open `http://localhost:3002` (library portal) in same browser  
3. Confirm no credential prompt — same Keycloak session reused  
4. Log out via portal logout link  
5. Confirm Keycloak session gone; both portals redirect to login again  

**Done when:** Playwright test (`tests/sso.playwright.mjs`) passes with captured output.

---

## 7. Open gaps vs. the spec

| Gap | Status |
|---|---|
| LDAP federation not configured in Keycloak | `BROKEN` — container now starts, but federation settings not added to realm |
| LDAP login as a federated user | NOT STARTED |
| SAML SP — no ACS handler, no signature validation | `BROKEN` scaffold |
| `/api/sessions/:userId` (GET + DELETE) | NOT IMPLEMENTED |
| `/api/applications/sessions` | NOT IMPLEMENTED |
| `/api/resources/admin` | NOT IMPLEMENTED |
| `POST /api/users` (create user) | NOT IMPLEMENTED |
| Role add/remove routes | NOT IMPLEMENTED |
| Group membership add/remove routes | NOT IMPLEMENTED |
| Access-review `revoke` action actually removes role in Keycloak | NOT IMPLEMENTED |
| 5-case OTP matrix with browser evidence | NOT STARTED |
| Themes — login/account/admin — applied and rendered correctly | UNVERIFIED |
| Merged audit page with `KEYCLOAK`/`APP` source tags (UI) | UNVERIFIED |
| Phase 3: risk register (7 automated checks) | NOT STARTED |
| Phase 3: before/after snapshots | NOT STARTED |
| Phase 3: charts | UNVERIFIED (dashboard scaffold exists) |
| Phase 3: CSV/PDF export | NOT IMPLEMENTED |
| Phase 3: failed-login alerts (automated) | NOT STARTED |
| `basic` scope on every client (fixes `sub` claim) | NOT YET CONFIRMED |
| Test file fixes (D-01, D-04, D-07, D-08) | NOT YET APPLIED |
| behavioural cross-dept denial test replacing D-08 regex | NOT YET WRITTEN |

---

## 8. Next steps in priority order

| # | Task | Done when |
|---|---|---|
| 1 | **Fix test file name mismatches** (D-01, D-04, D-07) — update `phase1-static.mjs` | `node tests/phase1-static.mjs` → all checks PASS |
| 2 | **Replace D-08 regex with behavioural cross-dept denial test** | Test GETs `/api/resources/ICT` with an ELEC-scoped token → HTTP 403 |
| 3 | **Add `basic` scope to every client in generator** and verify `sub` in token | Decoded JWT contains non-empty `sub`; `/api/me` → 200 |
| 4 | **Fresh-import test** using isolated project | `docker compose -p ganpat-test` imports cleanly; all 18 users get tokens |
| 5 | **Implement missing routes** — `/api/sessions/:userId` (GET+DELETE), `/api/applications/sessions`, `/api/resources/admin`, `POST /api/users`, role-add/remove, group-membership-add/remove | `phase1-static.mjs` backend check PASS; behavioural tests pass |
| 6 | **Access-review revoke** — actually remove role in Keycloak + write justification | `POST /api/access-reviews` with `decision=revoke` removes role via Admin API and writes `ACCESS_REVIEW_REVOKE` audit row |
| 7 | **Execute `mfa-flow.sh`** on isolated realm; run 5-case OTP matrix with browser evidence | All 5 cases pass with Playwright output |
| 8 | **LDAP federation** — add provider to realm generator; verify LDAP login | `ldapsearch` returns seed users; Keycloak login as LDAP user succeeds |
| 9 | **Real SAML SP** — add `samlify` or `passport-saml`; implement ACS, assertion view | SAML assertion attributes visible in browser; signature validated |
| 10 | **SSO + logout Gate 6** | Playwright test passes end-to-end |
| 11 | **Phase 3** — risk register, snapshots, CSV/PDF, alerts | All 7 risk checks automated; PDF export generates file |
| 12 | **Evidence run** — execute all 16 tests, capture real output | `docs/TEST_EVIDENCE.md` updated with real PASS/FAIL output |

---

## 9. How to run, reset, and test on Windows PowerShell

### Prerequisites
- Docker Desktop running
- Node 20+
- Copy `.env.example` → `.env` (demo values are already in the example)

### Start the main stack
```powershell
cd "C:\Users\vishw\Desktop\IAM P\ganpat-iam-project\ganpat-iam"
docker compose up -d --build
docker compose ps            # confirm all 8 services Up
```

### Check service health
```powershell
Invoke-WebRequest http://localhost:4000/health    # backend
Invoke-WebRequest http://localhost:8080/realms/ganpat-iam/.well-known/openid-configuration
```

### Regenerate realm JSON (after changing build-realm.mjs)
```powershell
$env:DEMO_USER_PASSWORD = "Ganpat@Demo2026!"     # demo only, never a real password
node keycloak/build-realm.mjs
# Verify: no real password value in output
Select-String -Path keycloak/realm/ganpat-iam-realm.json -Pattern 'Ganpat@Demo'
# Should return no results
Select-String -Path keycloak/realm/ganpat-iam-realm.json -Pattern 'DEMO_USER_PASSWORD'
# Should return lines with literal ${DEMO_USER_PASSWORD}
```

### Run static tests
```powershell
node tests/phase1-static.mjs
node --test tests/security-invariants.test.mjs
```

### Fresh isolated test import (SAFE — never touches main stack)
```powershell
# Use a separate project name and port offset so nothing collides with the main stack
docker compose -p ganpat-test up -d --build
# Run acceptance tests against test ports
$env:KEYCLOAK_URL = "http://localhost:18080"    # adjust if compose file maps different ports
node tests/acceptance-phase1.mjs
# Tear down ONLY the isolated project when done
docker compose -p ganpat-test down -v           # -v is safe only on the isolated project
```

### Stop without losing data
```powershell
docker compose stop                  # stops containers, volumes survive
docker compose down                  # removes containers + network, volumes survive
```

### Logs
```powershell
docker compose logs --tail 50 keycloak
docker compose logs --tail 50 backend
docker compose logs --tail 50 openldap
```

### Git workflow
```powershell
git status --short
# Stage and commit only after confirming no secrets:
git grep -nEi "secret|password" -- . ":!*.md" ":!package-lock.json"
git add -A
git status   # review staged files
git commit -m "your message"
git push origin main
```

**Never commit:** `.env`, `*.sql` dumps, `*.before-repair`, `node_modules/`, `dist/`, tokens, private keys, or any file with a real password.
