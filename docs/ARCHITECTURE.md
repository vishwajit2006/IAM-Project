# Architecture

- **Keycloak 26.4.0** is the identity authority for OIDC login, password checks, OTP/TOTP, realm roles, group membership, native user events, and admin events.
- **Express API** verifies JWTs with `jose` using Keycloak JWKS, exact issuer, `portal-api` audience, `exp`/`nbf` validation (5-second tolerance), RS256, and an allow-listed `azp`. Backend middleware is the authorization boundary.
- **React 18 / Vite / Tailwind / Recharts** is a public OIDC client using Authorization Code + PKCE S256. UI visibility is never considered authorization.
- **PostgreSQL** contains application governance records (departments, access-review decisions, acknowledgements, app audit events). Keycloak and APP audit sources remain separate.
- **OpenLDAP** is seeded as an external directory lab. It is not silently treated as a live federated provider: the actual Keycloak LDAP federation connection must be configured and tested as a later phase.
- **Departments are represented by Keycloak groups plus the app-level `departments` table**, not Keycloak Organizations. This choice gives practical department membership controls and keeps app-specific department metadata explicit.
- `saml-sp` is an explicitly labeled scaffold, not a claimed working SAML assertion consumer. A production-ready SAML SP needs a maintained SAML library, metadata trust, signature validation, replay protection, and ACS tests.
- Keycloak native events are `source=KEYCLOAK`; governance decisions and app actions are `source=APP`. Do not merge these streams or imply APP rows are Keycloak-native events.
