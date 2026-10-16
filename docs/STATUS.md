# Status log
- [baseline] Snapshot pushed, tag baseline-before-fixes. Hygiene commit 571234e is in.
- Gates 1-6 NOT yet passed. openldap fix applied but unverified (check docker compose ps -a).
- Next: fresh isolated import (-p ganpat-test), basic scope on all clients, run tests/gates-1-3.mjs.
- [Step 0] Stack healthy: Keycloak(8080), Backend(4000), OpenLDAP(1389), Postgres(5432), Portals(3000-3002), SAML-SP(3003).
- [Step 0] Verified Keycloak redirect URIs and web origins match host ports 3000, 3001, 3002, 3003.
