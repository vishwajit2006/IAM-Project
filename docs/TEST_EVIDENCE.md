# Test evidence

## Phase 1/2 checks executed in the available environment

- `node keycloak/build-realm.mjs` — exit 0; generated `keycloak/realm/ganpat-iam-realm.json` with 18 users, 10 realm roles, and 6 department groups.
- `node --test tests/*.test.mjs` — **14 passed, 0 failed**. These include realm shape checks and source-level security invariants; they are not end-to-end security tests.
- `node --check` on `keycloak/build-realm.mjs`, `backend/src/server.js`, `backend/src/security.js`, `backend/src/keycloak-admin.js`, and `apps/saml-sp/server.js` — exit 0.
- TypeScript transpiler syntax pass for all three JSX entry points (`portal`, `student-portal`, `library-portal`) — no syntax diagnostics.
- `sh -n` on database and Keycloak scripts — exit 0.
- Python JSON parsing for all repository JSON files and PyYAML parsing for `docker-compose.yml` — exit 0.

## Not run / not proven

- Docker Engine and `docker compose` are not installed in the build environment (`docker: command not found`). Therefore the containers have **not** been started, Keycloak 26.4.0 has **not** imported this JSON in a fresh container, and API/JWKS/Admin REST/LDAP/SSO/TOTP flows have **not** been end-to-end tested.
- `npm install` for the backend and portal timed out in this environment, so frontend production build and dependency install were not verified.
- The SAML service is explicitly a scaffold and does not validate SAML assertions.

Do not report this project as fully accepted until `docker compose up --build` succeeds on Docker Desktop, the realm import is confirmed in logs, health checks pass, and integration tests prove authentication and role/department denials with real tokens. Append exact commands, exit statuses, and outputs here.
