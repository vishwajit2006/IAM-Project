# Phase 1 Execution Report

## Source/static validation performed in the assistant workspace

| Check | Result | Evidence |
|---|---|---|
| Compose YAML parses | PASS | Parsed with PyYAML; 8 long-running services have healthchecks. |
| Generated realm JSON parses | PASS | `node keycloak/build-realm.mjs` generated 18 seed users, 10 realm roles, 6 department groups, and 7 clients. |
| Static contract checks | PASS | `node tests/phase1-static.mjs`: 9/9 PASS. |
| Backend JavaScript syntax | PASS | `node --check` for `server.js`, `security.js`, and `keycloak-admin.js`. |
| Realm builder and acceptance script syntax | PASS | `node --check` for `build-realm.mjs`, `acceptance-phase1.mjs`, and `sso.playwright.mjs`. |
| Frontend JSX parse/transpile | PASS | TypeScript's JSX transpiler parsed portal, Student Portal, and Library Portal sources without diagnostics. |

## Runtime acceptance requested

The runtime acceptance runner was invoked. This workspace does not have Docker installed (`spawnSync docker ENOENT`), and dependency installation timed out. Therefore the Compose stack could not be started here and the eight runtime acceptance checks were **not executed**. They must not be treated as passed.

| # | Runtime acceptance check | Result in this workspace | Reason |
|---:|---|---|---|
| 1 | `docker compose up --build` reaches healthy | FAIL / blocked | Docker executable is unavailable. |
| 2 | `stu.ict1`: student resource 200; admin resource 403 | FAIL / not run | Requires a running Keycloak/API stack. |
| 3 | Leader own-department reset 200; cross-department reset 403; leader delete 403; admin delete throwaway user 200 | FAIL / not run | Requires a running Keycloak/API stack. |
| 4 | `ro.audit` PUT user -> 403 | FAIL / not run | Requires a running API and issued token. |
| 5 | Tampered, expired, and wrong-audience tokens -> 401 | FAIL / not run | Requires a running Keycloak/API stack. |
| 6 | Weak password rejected by Keycloak | FAIL / not run | Requires a running Keycloak realm. |
| 7 | Playwright SSO across Student/Library apps and session removal after logout | FAIL / not run | Requires Docker, Playwright, and Chromium. |
| 8 | Keycloak native LOGIN and LOGIN_ERROR events retrievable | FAIL / not run | Requires a running Keycloak realm/API. |

## Run the runtime acceptance checks on Windows

1. Install/start Docker Desktop and ensure `docker compose version` works.
2. Ensure `.env` exists. If you already have one, preserve it; do not overwrite it blindly.
3. From the project root, install the browser-test dependency and browser once:

   ```cmd
   cd tests
   npm install
   npx playwright install chromium
   cd ..
   ```

4. For a genuinely clean database import, first back up anything you need. `docker compose down -v` deletes the project's PostgreSQL volume and all local IAM database data. Only run it if you accept that data loss.
5. Run `node tests/acceptance-phase1.mjs` from the project root. It starts the Compose stack and prints the observed PASS/FAIL table.

All `.env.example` values are demo-only. Keep the test-only `iam-test-cli` disabled in production by running the production remediation script from a trusted Keycloak admin environment.
