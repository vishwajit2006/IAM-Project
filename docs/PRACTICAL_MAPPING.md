# Practical mapping (03–16)

| Practical area | Integrated implementation / evidence |
|---|---|
| 03 — realm and user administration | Realm import JSON, 18 seeded individual users, 10 realm roles, six department groups |
| 04 — password policy / brute-force defense | Realm password policy and brute-force baseline; weak baseline and remediation scripts for controlled classroom comparison |
| 05 — RBAC | Realm roles and API-side authorization middleware |
| 06 — themes | Starter login/account/admin theme files with `ganpat` theme metadata and CSS; visual rendering still needs browser validation |
| 07 — SSO | OIDC public clients `iam-portal`, `student-portal`, `library-portal`, PKCE S256 |
| 08 — MFA | Keycloak TOTP policy; privileged users plus `mfa.test` are prompted to configure TOTP; TOTP secrets are not committed and OTP is never checked by the API. A pre-seeded TOTP credential and automated OTP test are not implemented yet. |
| 09 — LDAP | OpenLDAP is seeded and exposed on 1389; Keycloak LDAP federation wiring and sync acceptance tests are pending |
| 10 — department scope | Department groups, Keycloak group-scoped user listing/edit/disable/reset, own-profile editing, student/library resource authorization, and HR/IT/Finance resource route guards |
| 11 — client/application security | API audience mapper, exact issuer and azp validation, PKCE, backend-protected student/library resources |
| 12 — audit | Keycloak native user/admin event read endpoint plus separate APP audit table and action logging |
| 13 — access review | PostgreSQL review decision endpoint with audit event |
| 14 — risk/alerts | Alert storage and acknowledgement endpoint; automated risk signal generation pending |
| 15 — reporting/governance | Dashboard counts from Postgres and Keycloak Admin REST API; CSV/PDF export and richer risk analytics pending |
| 16 — auditing, reporting and IAM governance | Integrated dashboard scaffold, app audit and review data; full acceptance evidence pending |
