# Ganpat University IAM Governance & Security Dashboard

Academic project for **2CSE507 — Identity and Access Management**, B.Tech CSE Sem VII. Integrates practical work 03–16 into a Docker Compose lab.

## Quick start

```bash
cp .env.example .env
node keycloak/build-realm.mjs
docker compose up --build
```

Then open the admin portal at http://localhost:3000. Other endpoints: Keycloak http://localhost:8080, API http://localhost:4000/health, Student Portal http://localhost:3001, Library Portal http://localhost:3002, SAML scaffold http://localhost:3003, OpenLDAP localhost:1389.

**Demo credentials only:** seeded users use `Ganpat@Demo2026!`. Change all demo secrets before any use beyond an isolated local lab. The bootstrap admin is for initial realm administration, not a shared application account. Seeded named users are individual accounts. TOTP is enforced by Keycloak flows; this backend never verifies OTP or stores TOTP secrets.

## Important implementation status

This is a phase-based project. The repository provides a Compose topology, generated realm JSON, OIDC/PKCE clients, a least-privilege Keycloak service account provisioned by an idempotent script, JWT verification middleware, group-scoped user-management API routes, app access-review/audit endpoints, Keycloak-native event reads, dashboard metrics sourced from Postgres and Keycloak, starter theme files, and department resource guards. The SAML SP is a scaffold, not a working SAML implementation. LDAP federation, a pre-seeded TOTP credential/automated OTP test, visual theme validation, CSV/PDF exports, complete risk analytics, and full container acceptance evidence are not yet complete. Do not treat it as production-ready.

## Security model

- JWT verification uses `jose` and Keycloak JWKS; checks signature (RS256), issuer, audience `portal-api`, `exp`, `nbf` with 5-second tolerance, and an allowed `azp`.
- Backend middleware is authoritative. UI hiding is cosmetic only.
- Helmet, CORS allow-list, request rate limiting, Zod validation on write endpoints, and parameterized SQL are used.
- Keycloak-native and app-generated audit sources must remain distinct: `KEYCLOAK` vs `APP`.
- Department model: Keycloak groups + application `departments` table; Keycloak Organizations is intentionally not used.
- Secrets are environment variables. `.env.example` contains clearly labeled demo values only.

See `docs/ARCHITECTURE.md`, `docs/PRACTICAL_MAPPING.md`, and `docs/RUNBOOK.md`.
