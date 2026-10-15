import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const security = fs.readFileSync(path.join(root, 'backend/src/security.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'backend/src/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'backend/src/keycloak-admin.js'), 'utf8');
test('JWT verification pins issuer, audience, clock tolerance, and RS256', () => {
  assert.match(security, /jwtVerify\(token, jwks/);
  assert.match(security, /issuer, audience, clockTolerance: 5/);
  assert.match(security, /algorithms: \['RS256'\]/);
  assert.match(security, /payload\.azp/);
});
test('read-only guard blocks all non-GET methods', () => {
  assert.match(security, /read-only accounts cannot modify data/);
  assert.match(security, /!\['GET','HEAD','OPTIONS'\]\.includes\(req\.method\)/);
});
test('department membership authorization uses Keycloak group paths', () => {
  assert.match(security, /groupPaths\.some\(g => g === `\/Departments\/\$\{wanted\}`\)/);
  assert.doesNotMatch(security, /own && own === wanted/);
});
test('writes use parameterized SQL and input schemas', () => {
  assert.match(api, /z\.object\(/);
  assert.match(api, /VALUES\(\$1,\$2,\$3/);
});
test('Keycloak native and app audit sources remain separate', () => {
  assert.match(api, /source:'KEYCLOAK'/);
  assert.match(api, /'APP'/);
  assert.match(admin, /grant_type: 'client_credentials'/);
});
test('backend never implements OTP verification or stores TOTP secrets', () => {
  assert.doesNotMatch(api + security + admin, /verifyTOTP|totpSecret|otpSecret|otpauth:/i);
});
