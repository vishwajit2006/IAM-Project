const base = process.env.KEYCLOAK_ADMIN_BASE || 'http://keycloak:8080';
const realm = process.env.KEYCLOAK_ADMIN_REALM || 'ganpat-iam';
let tokenCache = { token: null, expiresAt: 0 };

async function serviceToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 15000) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.IAM_SERVICE_CLIENT_ID || 'iam-governance-service',
    client_secret: process.env.IAM_SERVICE_CLIENT_SECRET || ''
  });
  const response = await fetch(`${base}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
  });
  if (!response.ok) throw new Error(`Keycloak service token failed (${response.status})`);
  const data = await response.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 60) * 1000 };
  return tokenCache.token;
}

export async function kcAdmin(path, options = {}) {
  const token = await serviceToken();
  const response = await fetch(`${base}/admin/realms/${realm}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const body = await response.text();
  if (!response.ok) throw new Error(`Keycloak Admin API ${options.method || 'GET'} ${path} failed (${response.status}): ${body.slice(0, 250)}`);
  return body ? JSON.parse(body) : null;
}

export async function getUserWithGroups(id) {
  const [user, groups, roles] = await Promise.all([
    kcAdmin(`/users/${encodeURIComponent(id)}`),
    kcAdmin(`/users/${encodeURIComponent(id)}/groups`),
    kcAdmin(`/users/${encodeURIComponent(id)}/role-mappings/realm`)
  ]);
  return { ...user, groups: (groups || []).map(g => g.path), realmRoles: (roles || []).map(r => r.name) };
}
