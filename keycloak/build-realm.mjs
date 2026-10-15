
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lab-only password: provide it through the environment, never hardcode it.
// Write the env-var reference as a literal string so Keycloak interpolates it
// at --import-realm time. Never embed the resolved value in the generated JSON.
const password = '${DEMO_USER_PASSWORD}';

// Validate that the variable is actually set in the environment before generating
// the file; Keycloak will fail silently on import if the env var is missing.
if (!process.env.DEMO_USER_PASSWORD || process.env.DEMO_USER_PASSWORD.length < 12) {
  throw new Error(
    'Set DEMO_USER_PASSWORD to a lab-only password of at least 12 characters before running this generator.'
  );
}

const departments = [
  { name: 'ICT', code: 'ICT', description: 'Institute of Computer Technology' },
  { name: 'Electronics', code: 'ELEC', description: 'Electronics' },
  { name: 'Mechanical', code: 'MECH', description: 'Mechanical' },
  { name: 'HR', code: 'HR', description: 'Human Resources' },
  { name: 'IT', code: 'IT', description: 'Information Technology' },
  { name: 'Finance', code: 'FIN', description: 'Finance' }
];

const roles = [
  'org-head',
  'iam-admin',
  'dept-leader',
  'manager',
  'employee',
  'faculty',
  'student',
  'read-only',
  'mfa-required',
  'portal-api-access'
];

const userDefs = [
  ['head.ganpat', 'Vishwajit', 'Head', 'org-head', 'ICT'],
  ['admin.priya', 'Priya', 'Shah', 'iam-admin', 'IT'],
  ['admin.rahul', 'Rahul', 'Patel', 'iam-admin', 'IT'],
  ['mfa.admin', 'MFA', 'Administrator', 'iam-admin', 'IT'],
  ['leader.ict', 'ICT', 'Leader', 'dept-leader', 'ICT'],
  ['leader.ec', 'Electronics', 'Leader', 'dept-leader', 'Electronics'],
  ['leader.me', 'Mechanical', 'Leader', 'dept-leader', 'Mechanical'],
  ['manager.hr', 'HR', 'Manager', 'manager', 'HR'],
  ['emp.it1', 'IT', 'Employee One', 'employee', 'IT'],
  ['emp.fin1', 'Finance', 'Employee One', 'employee', 'Finance'],
  ['fac.ict1', 'ICT', 'Faculty One', 'faculty', 'ICT'],
  ['fac.ec1', 'Electronics', 'Faculty One', 'faculty', 'Electronics'],
  ['stu.ict1', 'ICT', 'Student One', 'student', 'ICT'],
  ['stu.ict2', 'ICT', 'Student Two', 'student', 'ICT'],
  ['stu.ec1', 'Electronics', 'Student One', 'student', 'Electronics'],
  ['stu.me1', 'Mechanical', 'Student One', 'student', 'Mechanical'],
  ['ro.audit', 'Audit', 'Read Only', 'read-only', 'IT'],
  ['mfa.test', 'MFA', 'Test Student', 'student', 'ICT']
];

const roleGroups = [
  { name: 'Students', role: 'student' },
  { name: 'Faculty', role: 'faculty' },
  { name: 'Employees', role: 'employee' },
  { name: 'Managers', role: 'manager' },
  { name: 'Leaders', role: 'dept-leader' },
  { name: 'Auditors', role: 'read-only' }
];

const roleGroupName = Object.fromEntries(
  roleGroups.map(({ name, role }) => [role, name])
);

// Each department has role subgroups with their corresponding realm roles.
const departmentGroups = departments.map((department) => ({
  name: department.name,
  path: `/Departments/${department.name}`,
  attributes: {
    department: [department.name],
    departmentCode: [department.code],
    description: [department.description]
  },
  subGroups: roleGroups.map(({ name, role }) => ({
    name,
    attributes: {
      department: [department.name],
      baseRole: [role]
    },
    realmRoles: [role],
    subGroups: []
  }))
}));

const seededUsers = userDefs.map(
  ([username, firstName, lastName, role, department], index) => {
    const userRoles = [role, 'portal-api-access'];

    if (['org-head', 'iam-admin', 'dept-leader'].includes(role)) {
      userRoles.push('mfa-required');
    }

    const groups = [
      `/Departments/${department}`,
      ...(roleGroupName[role]
        ? [`/Departments/${department}/${roleGroupName[role]}`]
        : [])
    ];

    const attributes = {
      department: [department]
    };

    if (role === 'student') {
      attributes.studentId = [
        `GU-${String(index + 1).padStart(4, '0')}`
      ];
    }

    return {
      username,
      enabled: true,
      email: `${username.replaceAll('.', '_')}@ganpat.example.edu`,
      emailVerified: true,
      firstName,
      lastName,
      attributes,
      groups,
      realmRoles: [...new Set(userRoles)],
      credentials: [
        {
          type: 'password',
          value: password,
          temporary: false
        }
      ],
      requiredActions: (
        ['org-head', 'iam-admin', 'dept-leader'].includes(role) ||
        ['mfa.admin', 'mfa.test'].includes(username)
      )
        ? ['CONFIGURE_TOTP']
        : []
    };
  }
);

// Explicit scopes on every browser-based OIDC client.
const defaultClientScopes = [
  'basic',
  'profile',
  'email',
  'roles',
  'web-origins',
  'acr'
];

const clientMappers = [
  {
    name: 'Subject (sub)',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-sub-mapper',
    consentRequired: false,
    config: {
      'access.token.claim': 'true',
      'introspection.token.claim': 'true',
      'lightweight.claim': 'false'
    }
  },
  {
    name: 'audience-portal-api',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-mapper',
    consentRequired: false,
    config: {
      'included.client.audience': 'portal-api',
      'id.token.claim': 'false',
      'access.token.claim': 'true'
    }
  },
  {
    name: 'groups',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-group-membership-mapper',
    consentRequired: false,
    config: {
      'full.path': 'true',
      'id.token.claim': 'true',
      'access.token.claim': 'true',
      'userinfo.token.claim': 'true',
      'claim.name': 'groups'
    }
  },
  {
    name: 'department',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-attribute-mapper',
    consentRequired: false,
    config: {
      'user.attribute': 'department',
      'claim.name': 'department',
      'jsonType.label': 'String',
      'id.token.claim': 'true',
      'access.token.claim': 'true',
      'userinfo.token.claim': 'true'
    }
  }
];

const oidcClient = (clientId, port, name = clientId) => ({
  clientId,
  name,
  enabled: true,
  protocol: 'openid-connect',
  publicClient: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  implicitFlowEnabled: false,
  serviceAccountsEnabled: false,
  redirectUris: [`http://localhost:${port}/*`],
  webOrigins: [`http://localhost:${port}`],
  attributes: {
    'pkce.code.challenge.method': 'S256',
    'post.logout.redirect.uris': `http://localhost:${port}/*`,
    'backchannel.logout.url': `http://localhost:${port}/backchannel-logout`,
    'backchannel.logout.session.required': 'true'
  },
  defaultClientScopes: [...defaultClientScopes],
  protocolMappers: structuredClone(clientMappers),
  frontchannelLogout: true
});

const realmRoles = roles.map((name) => {
  const isPrivileged = [
    'org-head',
    'iam-admin',
    'dept-leader'
  ].includes(name);

  return {
    name,
    description: `Ganpat IAM role: ${name}`,
    composite: isPrivileged,
    ...(isPrivileged
      ? { composites: { realm: ['mfa-required'] } }
      : {})
  };
});

const realm = {
  realm: 'ganpat-iam',
  displayName: 'Ganpat University IAM',
  enabled: true,
  // 'external' = HTTPS required for non-loopback clients; localhost HTTP still works.
  sslRequired: 'external',

  // The custom theme must exist in the Keycloak image before import.
  loginTheme: 'ganpat',
  accountTheme: 'ganpat',
  adminTheme: 'ganpat',

  registrationAllowed: false,
  resetPasswordAllowed: true,
  rememberMe: true,
  verifyEmail: false,
  loginWithEmailAllowed: true,
  duplicateEmailsAllowed: false,
  editUsernameAllowed: false,

  bruteForceProtected: true,
  permanentLockout: false,
  failureFactor: 5,
  waitIncrementSeconds: 60,
  maxFailureWaitSeconds: 900,
  minimumQuickLoginWaitSeconds: 60,
  quickLoginCheckMilliSeconds: 1000,
  maxDeltaTimeSeconds: 43200,

  passwordPolicy:
    'length(12) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1) and notUsername and passwordHistory(3)',

  roles: {
    realm: realmRoles
  },

  groups: [
    {
      name: 'Departments',
      path: '/Departments',
      attributes: {
        description: ['Department groups']
      },
      subGroups: departmentGroups
    }
  ],

  users: seededUsers,

  clients: [
    // These IDs must match the browser applications and JWT middleware.
    oidcClient(
      'iam-portal',
      3000,
      'Ganpat IAM Governance Portal'
    ),
    oidcClient('student-portal', 3001, 'Student Portal'),
    oidcClient('library-portal', 3002, 'Library Portal'),

    // API audience only; this is not a browser login client.
    {
      clientId: 'portal-api',
      name: 'Portal API audience',
      enabled: true,
      protocol: 'openid-connect',
      publicClient: false,
      bearerOnly: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false
    },

    // Backend service account. setup.sh supplies its secret and permissions.
    {
      clientId: 'iam-governance-service',
      name: 'IAM Governance Backend Service',
      enabled: true,
      protocol: 'openid-connect',
      publicClient: false,
      clientAuthenticatorType: 'client-secret',
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: true
    },

    // Isolated acceptance-test client. Never enable direct grants on
    // the browser application clients. Do not use this client in production.
    {
      clientId: 'iam-test-cli',
      name: 'TEST ONLY - acceptance tests',
      enabled: true,
      protocol: 'openid-connect',
      publicClient: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: true,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: false,
      attributes: {
        'test.only': 'true'
      },
      defaultClientScopes: [...defaultClientScopes],
      protocolMappers: structuredClone(clientMappers)
    },

    // Separate SAML integration client.
    {
      clientId: 'saml-sp',
      name: 'SAML Service Provider Demo',
      enabled: true,
      protocol: 'saml',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: ['http://localhost:3003/*'],
      attributes: {
        'saml.force.post.binding': 'true',
        'saml_name_id_format': 'username',
        'saml_assertion_consumer_url_post': 'http://localhost:3003/saml/acs',
        'saml_single_logout_service_url_redirect': 'http://localhost:3003/saml/logout'
      }
    }
  ],

  clientScopes: [
    {
      name: 'basic',
      protocol: 'openid-connect',
      attributes: {
        'include.in.token.scope': 'false',
        'display.on.consent.screen': 'false'
      },
      protocolMappers: [
        {
          name: 'Subject (sub)',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-sub-mapper',
          consentRequired: false,
          config: {
            'access.token.claim': 'true',
            'introspection.token.claim': 'true'
          }
        }
      ]
    },
    {
      name: 'department',
      protocol: 'openid-connect',
      attributes: {
        'include.in.token.scope': 'true',
        'display.on.consent.screen': 'false'
      }
    }
  ],

  defaultDefaultClientScopes: [...defaultClientScopes],
  defaultOptionalClientScopes: [
    'address',
    'phone',
    'offline_access',
    'microprofile-jwt',
    'department'
  ],

  eventsEnabled: true,
  eventsExpiration: 2592000,
  eventsListeners: ['jboss-logging'],
  enabledEventTypes: [
    'LOGIN',
    'LOGIN_ERROR',
    'LOGOUT',
    'UPDATE_PASSWORD',
    'UPDATE_TOTP',
    'REMOVE_TOTP',
    'RESET_PASSWORD',
    'REGISTER',
    'DELETE_ACCOUNT',
    'CODE_TO_TOKEN',
    'CODE_TO_TOKEN_ERROR',
    'REFRESH_TOKEN_ERROR',
    'CLIENT_LOGIN'
  ],
  adminEventsEnabled: true,
  adminEventsDetailsEnabled: true,

  otpPolicyType: 'totp',
  otpPolicyAlgorithm: 'HmacSHA1',
  otpPolicyDigits: 6,
  otpPolicyPeriod: 30,
  otpPolicyLookAheadWindow: 1
};

const out = path.join(
  __dirname,
  'realm',
  'ganpat-iam-realm.json'
);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(realm, null, 2) + '\n');

console.log(
  `Wrote ${out}: ${seededUsers.length} users, ` +
  `${realmRoles.length} roles, ` +
  `${departmentGroups.length} departments, ` +
  `${realm.clients.length} clients.`
);
