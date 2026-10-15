
import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer =
  process.env.KEYCLOAK_ISSUER ||
  'http://localhost:8080/realms/ganpat-iam';

const jwks = createRemoteJWKSet(
  new URL(
    process.env.KEYCLOAK_JWKS_URL ||
    'http://localhost:8080/realms/ganpat-iam/protocol/openid-connect/certs'
  )
);

const audience = 'portal-api';
const allowedClients = [
  'iam-portal',
  'student-portal',
  'library-portal',
  'saml-sp'
];

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Bearer token required'
      });
    }

    const token = header.slice(7);

    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      clockTolerance: 5,
      algorithms: ['RS256']
    });

    console.log('[JWT diagnostic]', {
      subPresent: Boolean(payload.sub),
      azp: payload.azp,
      aud: payload.aud
    });

    if (
      !payload.sub ||
      !payload.azp ||
      !allowedClients.includes(payload.azp)
    ) {
      return res.status(401).json({
        error: 'Invalid token subject or authorized party'
      });
    }

    const roles = payload.realm_access?.roles || [];
console.log('[ROLE diagnostic]', {
  subPresent: Boolean(payload.sub),
  azp: payload.azp,
  roles
});

    req.identity = {
      sub: payload.sub,
      username: payload.preferred_username || '',
      email: payload.email || '',
      department: payload.department || payload.department_code || '',
      roles,
      groups: Array.isArray(payload.groups) ? payload.groups : [],
      azp: payload.azp
    };

    return next();
  } catch (error) {
    // Do not log tokens or secrets.
    console.error('[JWT verification failed]', error.code || error.name);

    return res.status(401).json({
      error: 'Invalid or expired access token'
    });
  }
}

export function requireAnyRole(...allowed) {
  return (req, res, next) => {
    if (req.identity?.roles?.includes('org-head')) {
      return next();
    }

    if (req.identity?.roles?.some(role => allowed.includes(role))) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden: insufficient role'
    });
  };
}

export function requireReadOnlyForWrites(req, res, next) {
  if (
    req.identity?.roles?.includes('read-only') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  ) {
    return res.status(403).json({
      error: 'Forbidden: read-only accounts cannot modify data'
    });
  }

  return next();
}

export function requireDepartment(req, res, next) {
  const identity = req.identity;

  if (
    identity.roles.includes('org-head') ||
    identity.roles.includes('iam-admin')
  ) {
    return next();
  }

  const wanted =
    req.params.department ||
    req.body?.department ||
    req.query?.department;

  const member = identity.groups.some(
    group => group === `/Departments/${wanted}`
  );

  if (!wanted || !member) {
    return res.status(403).json({
      error:
        'Forbidden: department-scoped access only; target must be in your department'
    });
  }

  return next();
}
