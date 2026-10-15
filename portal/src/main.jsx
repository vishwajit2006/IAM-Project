import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import Keycloak from 'keycloak-js';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Building2,
  ClipboardCheck,
  Activity,
  LogIn,
  LogOut,
  FileClock,
  Settings,
  Bell,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Menu,
  X,
  RefreshCw,
  BarChart2,
  PieChart as PieChartIcon,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import './style.css';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const kc = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'ganpat-iam',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'iam-portal'
});

// Navigation config with role-based access control
const NAV_ITEMS = [
  { id: 'dashboard', path: '/', label: 'Overview', icon: Activity, roles: ['iam-admin', 'org-head', 'dept-leader', 'manager', 'read-only', 'auditor'] },
  { id: 'users', path: '/users', label: 'Identity & Access', icon: Users, roles: ['iam-admin', 'org-head', 'dept-leader', 'manager', 'read-only'] },
  { id: 'reviews', path: '/reviews', label: 'Access Reviews', icon: ClipboardCheck, roles: ['iam-admin', 'org-head', 'read-only', 'auditor'] },
  { id: 'departments', path: '/departments', label: 'Departments', icon: Building2, roles: ['iam-admin', 'org-head', 'dept-leader', 'manager', 'read-only'] },
  { id: 'audit', path: '/audit', label: 'Keycloak Audit', icon: FileClock, roles: ['iam-admin', 'org-head', 'read-only', 'auditor'] },
  { id: 'app-audit', path: '/app-audit', label: 'App Audit', icon: ShieldCheck, roles: ['iam-admin', 'org-head', 'read-only', 'auditor'] },
  { id: 'alerts', path: '/alerts', label: 'Risk & Alerts', icon: Bell, roles: ['iam-admin', 'org-head', 'read-only', 'auditor'] },
  { id: 'remediations', path: '/remediations', label: 'Remediations', icon: ShieldAlert, roles: ['iam-admin', 'org-head', 'read-only'] },
  { id: 'iam-config', path: '/iam-config', label: 'IAM Configuration', icon: Settings, roles: ['iam-admin', 'org-head'] }
];

const ROLE_COLORS = {
  'iam-admin': '#ef4444',
  'org-head': '#dc2626',
  'dept-leader': '#f59e0b',
  'manager': '#10b981',
  'auditor': '#8b5cf6',
  'read-only': '#6366f1',
  'employee': '#3b82f6',
  'student': '#06b6d4',
  'faculty': '#0ea5e9'
};

function App() {
  const location = useLocation();
  const page = location.pathname.replace(/^\//, '') || 'dashboard';
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardExtra, setDashboardExtra] = useState({ audit: null, users: null });
  const [pageData, setPageData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roles = useMemo(() => identity?.realm_access?.roles || [], [identity]);
  const isGlobalAdmin = roles.includes('org-head') || roles.includes('iam-admin');
  const userGroups = useMemo(() => identity?.groups || [], [identity]);
  const primaryRole = roles.find(r => ['iam-admin', 'org-head', 'dept-leader', 'manager', 'auditor', 'read-only'].includes(r)) || roles[0] || 'Authenticated';

  // Keycloak SSO initialization (unchanged auth logic)
  useEffect(() => {
    kc.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false })
      .then(async authenticated => {
        if (authenticated) setIdentity(kc.tokenParsed);
        setReady(true);
      })
      .catch(e => {
        setError('Identity provider unavailable: ' + e.message);
        setReady(true);
      });
  }, []);

  // Standard API wrapper (unchanged API calls / token handling)
  const api = useCallback(async (path, options = {}) => {
    if (!kc.authenticated) throw new Error('Please sign in first.');

    await kc.updateToken(30);

    console.log('[Access token diagnostic]', {
      authenticated: kc.authenticated,
      hasToken: Boolean(kc.token),
      subjectPresent: Boolean(kc.tokenParsed?.sub),
      authorizedParty: kc.tokenParsed?.azp ?? null,
      audience: kc.tokenParsed?.aud ?? null,
      roles: kc.tokenParsed?.realm_access?.roles ?? []
    });

    const response = await fetch(apiBase + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      let message = `API ${response.status}`;
      try {
        message = (await response.json()).error || message;
      } catch {}
      throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      setError('');
      const data = await api('/api/dashboard');
      setDashboard(data);

      // Best-effort supplementary metrics for admin dashboards (no failure if forbidden)
      if (roles.includes('iam-admin') || roles.includes('org-head') || roles.includes('read-only')) {
        try {
          const [auditRes, usersRes] = await Promise.allSettled([
            api('/api/audit/keycloak?limit=100'),
            api('/api/users')
          ]);
          setDashboardExtra({
            audit: auditRes.status === 'fulfilled' ? auditRes.value : null,
            users: usersRes.status === 'fulfilled' ? usersRes.value : null
          });
        } catch {}
      }
    } catch (e) {
      setError(e.message);
    }
  }, [api, roles]);

  const refreshPage = useCallback(async () => {
    if (!identity || page === 'dashboard') return;
    const route =
      page === 'users' ? '/api/users' :
      page === 'reviews' ? '/api/access-reviews' :
      page === 'departments' ? '/api/departments' :
      page === 'audit' ? '/api/audit/keycloak' :
      page === 'app-audit' ? '/api/audit/app' :
      page === 'alerts' ? '/api/alerts' :
      page === 'remediations' ? '/api/remediations' :
      page === 'iam-config' ? '/api/iam/config' :
      page.startsWith('resources/') ? `/api/resources/${encodeURIComponent(page.split('/')[1])}` :
      null;

    if (!route) {
      setPageData({ error: 'Page not found.' });
      return;
    }

    try {
      setError('');
      setPageData(null); // Show skeleton while loading
      const data = await api(route);
      setPageData(data);
    } catch (e) {
      setPageData(null);
      setError(e.message);
    }
  }, [api, identity, page]);

  useEffect(() => {
    if (identity && page === 'dashboard') refreshDashboard();
    else if (identity) refreshPage();
  }, [identity, page, refreshDashboard, refreshPage]);

  // Actions
  async function submitReview(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await api('/api/access-reviews', {
        method: 'POST',
        body: JSON.stringify({
          subjectSub: form.get('subjectSub'),
          subjectUsername: form.get('subjectUsername'),
          department: form.get('department') || null,
          decision: form.get('decision'),
          rationale: form.get('rationale')
        })
      });
      event.currentTarget.reset();
      await refreshPage();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(id) {
    try {
      await api(`/api/alerts/${id}/acknowledge`, { method: 'POST', body: '{}' });
      await refreshPage();
    } catch (e) {
      setError(e.message);
    }
  }

  async function setEnabled(user) {
    try {
      await api(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !user.enabled })
      });
      await refreshPage();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remediate(user, action) {
    const rationale = window.prompt(`Reason for ${action.toLowerCase().replace('_', ' ')} ${user.username}:`);
    if (!rationale) return;
    try {
      await api('/api/remediations', {
        method: 'POST',
        body: JSON.stringify({ subjectId: user.id, action, rationale })
      });
      await refreshPage();
    } catch (e) {
      setError(e.message);
    }
  }

  async function savePolicy(event) {
    event.preventDefault();
    const policy = new FormData(event.currentTarget).get('policy');
    try {
      setBusy(true);
      await api('/api/iam/password-policy', {
        method: 'PUT',
        body: JSON.stringify({ policy })
      });
      await refreshPage();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Check if current user has permission for active page
  const activeNavItem = NAV_ITEMS.find(item => item.id === page || (item.id === 'dashboard' && page === ''));
  const hasPageAccess = useMemo(() => {
    if (!identity) return true;
    if (page.startsWith('resources/')) {
      const dept = page.split('/')[1];
      if (isGlobalAdmin) return true;
      return userGroups.includes(`/Departments/${dept}`);
    }
    if (!activeNavItem) return true;
    return activeNavItem.roles.some(r => roles.includes(r));
  }, [identity, page, activeNavItem, roles, isGlobalAdmin, userGroups]);

  // Filter sidebar navigation strictly based on role
  const allowedNavItems = useMemo(() => {
    if (!identity) return NAV_ITEMS.filter(item => item.id === 'dashboard');
    return NAV_ITEMS.filter(item => item.roles.some(r => roles.includes(r)));
  }, [identity, roles]);

  // Protected areas role-filtered
  const allowedDepartments = useMemo(() => {
    if (!identity) return [];
    if (isGlobalAdmin) return ['HR', 'IT', 'Finance'];
    return ['HR', 'IT', 'Finance'].filter(dept => userGroups.includes(`/Departments/${dept}`));
  }, [identity, isGlobalAdmin, userGroups]);

  // Chart data calculations
  const loginStatsData = useMemo(() => {
    const events = (page === 'audit' ? pageData?.events : dashboardExtra?.audit?.events) || [];
    let success = 0;
    let failed = 0;
    events.forEach(e => {
      if (e.type === 'LOGIN') success++;
      else if (e.type === 'LOGIN_ERROR') failed++;
    });
    if (success === 0 && failed === 0 && events.length > 0) {
      success = events.filter(e => !e.type?.includes('ERROR')).length;
      failed = events.filter(e => e.type?.includes('ERROR')).length;
    }
    return [
      { name: 'Successful', count: success, fill: '#10b981' },
      { name: 'Failed', count: failed, fill: '#ef4444' }
    ];
  }, [page, pageData, dashboardExtra]);

  const roleDistributionData = useMemo(() => {
    const usersList = (page === 'users' ? pageData?.users : dashboardExtra?.users?.users) || [];
    const counts = {};
    usersList.forEach(u => {
      const uRoles = u.realmRoles || [];
      uRoles.forEach(r => {
        if (!['default-roles-ganpat-iam', 'offline_access', 'uma_authorization'].includes(r)) {
          counts[r] = (counts[r] || 0) + 1;
        }
      });
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      fill: ROLE_COLORS[name] || '#3b82f6'
    }));
  }, [page, pageData, dashboardExtra]);

  return (
    <div className="shell">
      {/* Mobile Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Navy Icon Sidebar (Filtered by Role) */}
      <aside className={mobileMenuOpen ? 'mobile-open' : ''}>
        <div className="brand">
          <div className="brand-icon-box">
            <ShieldCheck size={22} />
          </div>
          <div>
            <b>GANPAT IAM</b>
            <small>Governance Portal</small>
          </div>
          <button className="close-sidebar-btn" onClick={() => setMobileMenuOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="nav-scroll">
          <nav>
            {allowedNavItems.map(item => {
              const Icon = item.icon;
              const isActive = (item.id === 'dashboard' && (page === 'dashboard' || page === '')) || page === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={isActive ? 'active' : ''}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {allowedDepartments.length > 0 && (
              <>
                <div className="navlabel">Protected Areas</div>
                {allowedDepartments.map(d => {
                  const isActive = page === `resources/${d}`;
                  return (
                    <Link
                      key={d}
                      to={`/resources/${d}`}
                      className={isActive ? 'active' : ''}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Lock size={16} />
                      <span>{d} Resource</span>
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </div>

        <div className="sidefoot">
          <div>2CSE507 · IAM Practicals</div>
          <div className="sidefoot-badge">
            <ShieldCheck size={11} />
            <span>Security by design</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        {/* Consistent Top Bar with User & Role */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="topbar-breadcrumb">
              <span className="eyebrow">Identity Governance</span>
              <h1>{pageTitle(page)}</h1>
            </div>
          </div>

          <div className="topbar-right">
            {identity ? (
              <>
                <div className="user-profile-chip">
                  <div className="user-avatar">
                    {(identity.name || identity.preferred_username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="user-info-text">
                    <span className="user-display-name">
                      {identity.name || identity.preferred_username}
                    </span>
                    <span className="user-display-role">
                      <RoleChip role={primaryRole} />
                    </span>
                  </div>
                </div>
                <button className="small secondary" onClick={() => kc.logout()}>
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <button className="small" onClick={() => kc.login()}>
                <LogIn size={14} />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main>
          {error && (
            <div className="error-banner">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {!ready ? (
            <div className="panel">
              <div className="skeleton-table">
                <div className="skeleton-box" style={{ height: '32px', width: '220px' }} />
                <div className="skeleton-box" style={{ height: '16px', width: '380px' }} />
                <div className="skeleton-box" style={{ height: '180px', width: '100%' }} />
              </div>
            </div>
          ) : !identity ? (
            <section className="welcome">
              <ShieldCheck size={48} />
              <h2>One Identity. Controlled Access.</h2>
              <p>
                Sign in through Ganpat University Keycloak IAM. Authentication, single sign-on, and MFA
                are managed securely by the identity provider.
              </p>
              <button onClick={() => kc.login()}>
                <LogIn size={16} />
                <span>Sign in securely</span>
              </button>
              <p style={{ marginTop: '20px', fontSize: '11.5px', color: '#94a3b8' }}>
                Realm: ganpat-iam · OIDC Authorization Code Flow with PKCE S256
              </p>
            </section>
          ) : !hasPageAccess ? (
            <AccessDenied
              role={primaryRole}
              page={page}
              requiredRoles={activeNavItem?.roles || ['Authorized Group']}
            />
          ) : (
            <>
              {/* DASHBOARD OVERVIEW */}
              {page === 'dashboard' && (
                <>
                  <section className="welcome compact">
                    <div>
                      <span className="eyebrow" style={{ color: '#93c5fd' }}>AUTHENTICATED SESSION</span>
                      <h2>{identity.name || identity.preferred_username}</h2>
                      <p>
                        {identity.email || 'No email claim'} · Department:{' '}
                        {userGroups.find(g => g.startsWith('/Departments/'))?.replace('/Departments/', '') || 'University-wide'}
                      </p>
                    </div>
                    <button className="secondary" onClick={refreshDashboard}>
                      <RefreshCw size={14} />
                      <span>Refresh Metrics</span>
                    </button>
                  </section>

                  {/* Stat Cards */}
                  <div className="cards">
                    {dashboard ? (
                      <>
                        <MetricCard
                          label="Keycloak Users"
                          value={dashboard?.metrics?.keycloakUsers ?? '—'}
                          icon={<Users size={22} />}
                          source="KEYCLOAK"
                        />
                        <MetricCard
                          label="Access Reviews"
                          value={dashboard?.metrics?.accessReviews ?? '—'}
                          icon={<ClipboardCheck size={22} />}
                          source="APP"
                        />
                        <MetricCard
                          label="Open Risk Alerts"
                          value={dashboard?.metrics?.openAlerts ?? '—'}
                          icon={<Bell size={22} />}
                          source="APP"
                        />
                        <MetricCard
                          label="App Audit Events"
                          value={dashboard?.metrics?.appAuditEvents ?? '—'}
                          icon={<ShieldCheck size={22} />}
                          source="APP"
                        />
                      </>
                    ) : (
                      <>
                        <div className="skeleton-metric" />
                        <div className="skeleton-metric" />
                        <div className="skeleton-metric" />
                        <div className="skeleton-metric" />
                      </>
                    )}
                  </div>

                  {/* Recharts Multi-chart Grid */}
                  <div className="chart-grid">
                    {/* Chart 1: Users per Department */}
                    <div className="chart-card">
                      <div className="chart-card-head">
                        <h3>Users per Department</h3>
                        <SourceBadge source="KEYCLOAK + APP" />
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                        Live department membership from Keycloak Admin REST API.
                      </p>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dashboard?.departmentUsers || []}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                          <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                          />
                          <Bar dataKey="users" name="Users" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Chart 2: Successful vs Failed Logins */}
                    <div className="chart-card">
                      <div className="chart-card-head">
                        <h3>Authentication Outcomes</h3>
                        <SourceBadge source="KEYCLOAK" />
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                        Successful vs failed logins from Keycloak event stream.
                      </p>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={loginStatsData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                          <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                          />
                          <Bar dataKey="count" name="Logins" radius={[6, 6, 0, 0]}>
                            {loginStatsData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Chart 3: Role Distribution */}
                    {roleDistributionData.length > 0 && (
                      <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
                        <div className="chart-card-head">
                          <h3>Realm Role Distribution</h3>
                          <SourceBadge source="KEYCLOAK" />
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                          Count of identities assigned to each active realm role.
                        </p>
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={roleDistributionData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                            <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                            <Tooltip
                              contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                            />
                            <Bar dataKey="count" name="Identities" radius={[6, 6, 0, 0]}>
                              {roleDistributionData.map((entry, index) => (
                                <Cell key={`role-cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* USERS / IDENTITY DIRECTORY */}
              {page === 'users' && (
                <section className="panel">
                  <PanelHeader title="Identity & Access Directory" source="KEYCLOAK" onRefresh={refreshPage} />
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    Department-scoped user listing. Authorization boundaries are enforced strictly by the backend API.
                  </p>

                  {/* Recharts: Role Distribution on Users Page */}
                  {roleDistributionData.length > 0 && (
                    <div className="chart-card" style={{ marginBottom: '20px' }}>
                      <div className="chart-card-head">
                        <h3>Role Distribution Across Users</h3>
                        <span className="mono" style={{ fontSize: '11px' }}>{pageData?.users?.length || 0} Total Users</span>
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={roleDistributionData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                          <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                          />
                          <Bar dataKey="count" name="Users" radius={[6, 6, 0, 0]}>
                            {roleDistributionData.map((entry, index) => (
                              <Cell key={`cell-u-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {!pageData ? (
                    <LoadingSkeleton rows={6} />
                  ) : pageData.users ? (
                    <Table
                      headers={['Username', 'Name', 'Email', 'Department', 'Realm Roles', 'Status', 'Actions']}
                      rows={pageData.users.map(u => [
                        <span className="mono" style={{ fontWeight: 600 }}>{u.username}</span>,
                        `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—',
                        u.email || '—',
                        u.department || '—',
                        <div className="actions">
                          {(u.realmRoles || []).map(r => (
                            <RoleChip key={r} role={r} />
                          ))}
                        </div>,
                        <StatusChip status={u.enabled ? 'Enabled' : 'Disabled'} />,
                        <div className="actions">
                          {!roles.includes('manager') && (
                            <button className="small secondary" onClick={() => setEnabled(u)}>
                              {u.enabled ? 'Disable' : 'Enable'}
                            </button>
                          )}
                          {isGlobalAdmin && (
                            <button
                              className="small secondary"
                              onClick={() => remediate(u, u.enabled ? 'DISABLE_USER' : 'ENABLE_USER')}
                            >
                              Remediate
                            </button>
                          )}
                        </div>
                      ])}
                    />
                  ) : (
                    <EmptyState title="No users found" message="No user accounts were returned for your department scope." />
                  )}
                </section>
              )}

              {/* ACCESS REVIEWS */}
              {page === 'reviews' && (
                <>
                  <section className="panel">
                    <PanelHeader title="Access Review Management" source="APP / POSTGRES" onRefresh={refreshPage} />
                    {isGlobalAdmin && (
                      <form className="reviewform" onSubmit={submitReview}>
                        <label>Record Attestation Decision</label>
                        <input name="subjectSub" required placeholder="Keycloak User ID (sub UUID)" />
                        <input name="subjectUsername" required placeholder="Username" />
                        <input name="department" placeholder="Department (e.g. HR, IT)" />
                        <select name="decision">
                          <option value="APPROVE">APPROVE · Access Justified</option>
                          <option value="REVOKE">REVOKE · Deprovision Access</option>
                          <option value="INVESTIGATE">INVESTIGATE · Escalate Risk</option>
                        </select>
                        <textarea
                          name="rationale"
                          required
                          minLength={5}
                          placeholder="Document governance rationale for this attestation decision..."
                        />
                        <button disabled={busy}>
                          {busy ? 'Saving Decision…' : 'Record Review Decision'}
                        </button>
                      </form>
                    )}
                  </section>

                  <section className="panel">
                    <div className="panelhead">
                      <div>
                        <h2>Access Review History</h2>
                        <p>Complete historical log of periodic entitlement reviews.</p>
                      </div>
                    </div>
                    {!pageData ? (
                      <LoadingSkeleton rows={5} />
                    ) : pageData.reviews ? (
                      <Table
                        headers={['Subject User', 'Department', 'Decision', 'Reviewer', 'Rationale', 'Created']}
                        rows={pageData.reviews.map(r => [
                          <span className="mono" style={{ fontWeight: 600 }}>{r.subject_username}</span>,
                          r.department || '—',
                          <StatusChip status={r.decision} />,
                          <span className="mono">{r.reviewer_username}</span>,
                          r.rationale,
                          <span className="mono">{new Date(r.created_at).toLocaleString()}</span>
                        ])}
                      />
                    ) : (
                      <EmptyState title="No reviews found" message="No access reviews have been recorded yet." />
                    )}
                  </section>
                </>
              )}

              {/* DEPARTMENTS */}
              {page === 'departments' && (
                <section className="panel">
                  <PanelHeader title="Department Directory" source="APP / POSTGRES" onRefresh={refreshPage} />
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    University organizational units mapped to Keycloak security groups.
                  </p>
                  {!pageData ? (
                    <LoadingSkeleton rows={4} />
                  ) : pageData.departments ? (
                    <Table
                      headers={['Code', 'Department Name', 'Keycloak Group Path']}
                      rows={pageData.departments.map(d => [
                        <span className="role-chip role-user">{d.code}</span>,
                        <strong>{d.name}</strong>,
                        <span className="mono">{d.keycloak_group_path}</span>
                      ])}
                    />
                  ) : (
                    <EmptyState title="No departments found" message="No department definitions loaded." />
                  )}
                </section>
              )}

              {/* KEYCLOAK AUDIT */}
              {page === 'audit' && (
                <section className="panel">
                  <PanelHeader title="Keycloak Native Events" source="KEYCLOAK" onRefresh={refreshPage} />
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    Raw authentication events and admin operations emitted by Keycloak IAM.
                  </p>

                  {/* Recharts: Successful vs Failed Logins Chart */}
                  <div className="chart-card" style={{ marginBottom: '20px' }}>
                    <div className="chart-card-head">
                      <h3>Authentication Breakdown: Successful vs Failed</h3>
                      <div className="chart-legend">
                        <span className="chart-legend-item">
                          <span className="legend-dot" style={{ background: '#10b981' }} />
                          Successful Logins ({loginStatsData[0]?.count || 0})
                        </span>
                        <span className="chart-legend-item">
                          <span className="legend-dot" style={{ background: '#ef4444' }} />
                          Failed Logins ({loginStatsData[1]?.count || 0})
                        </span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={loginStatsData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                        <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                        <Tooltip
                          contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                        />
                        <Bar dataKey="count" name="Events" radius={[6, 6, 0, 0]}>
                          {loginStatsData.map((entry, index) => (
                            <Cell key={`audit-c-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {!pageData ? (
                    <LoadingSkeleton rows={6} />
                  ) : pageData.events ? (
                    <>
                      <Table
                        headers={['Timestamp', 'Event Type', 'Client ID', 'User / Principal', 'IP Address']}
                        rows={[...pageData.events].map(e => [
                          <span className="mono">{e.time ? new Date(e.time).toLocaleString() : '—'}</span>,
                          <StatusChip status={e.type || '—'} />,
                          <span className="mono">{e.clientId || '—'}</span>,
                          <span className="mono">{e.username || e.userId || '—'}</span>,
                          <span className="mono">{e.ipAddress || '—'}</span>
                        ])}
                      />
                      {pageData.adminEvents && pageData.adminEvents.length > 0 && (
                        <div style={{ marginTop: '28px' }}>
                          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px' }}>Keycloak Admin Operations</h2>
                          <Table
                            headers={['Timestamp', 'Operation', 'Resource Type', 'Admin User', 'Client IP']}
                            rows={pageData.adminEvents.map(e => [
                              <span className="mono">{e.time ? new Date(e.time).toLocaleString() : '—'}</span>,
                              <StatusChip status={e.operationType || '—'} />,
                              e.resourceType || '—',
                              <span className="mono">{e.authDetails?.username || e.authDetails?.userId || '—'}</span>,
                              <span className="mono">{e.authDetails?.ipAddress || '—'}</span>
                            ])}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <EmptyState title="No audit events" message="No Keycloak authentication events are logged yet." />
                  )}
                </section>
              )}

              {/* APPLICATION AUDIT */}
              {page === 'app-audit' && (
                <section className="panel">
                  <PanelHeader title="Application Security Audit" source="APP / POSTGRES" onRefresh={refreshPage} />
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    Immutable PostgreSQL ledger tracking security-sensitive administrative actions.
                  </p>
                  {!pageData ? (
                    <LoadingSkeleton rows={6} />
                  ) : pageData.events ? (
                    <Table
                      headers={['Timestamp', 'Actor', 'Action', 'Target', 'Department', 'Outcome']}
                      rows={pageData.events.map(e => [
                        <span className="mono">{new Date(e.created_at).toLocaleString()}</span>,
                        <span className="mono" style={{ fontWeight: 600 }}>{e.actor_username}</span>,
                        <span className="role-chip role-user">{e.action}</span>,
                        <span className="mono">{e.target || '—'}</span>,
                        e.department || '—',
                        <StatusChip status={e.outcome || 'SUCCESS'} />
                      ])}
                    />
                  ) : (
                    <EmptyState title="No application audit events" message="No application audit logs recorded." />
                  )}
                </section>
              )}

              {/* RISK & ALERTS */}
              {page === 'alerts' && (
                <section className="panel">
                  <PanelHeader title="Risk & Anomaly Register" source="APP / POSTGRES" onRefresh={refreshPage} />
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    Governance risk alerts and anomaly detections requiring administrator acknowledgement.
                  </p>
                  {!pageData ? (
                    <LoadingSkeleton rows={4} />
                  ) : pageData.alerts && pageData.alerts.length > 0 ? (
                    <Table
                      headers={['Severity', 'Anomaly Kind', 'Details', 'Triggered At', 'Status / Acknowledgement']}
                      rows={pageData.alerts.map(a => [
                        <StatusChip status={a.severity} />,
                        <strong>{a.kind}</strong>,
                        a.message,
                        <span className="mono">{new Date(a.created_at).toLocaleString()}</span>,
                        a.acknowledged_at ? (
                          <span style={{ fontSize: '11.5px', color: '#16a34a' }}>
                            ✓ Acknowledged by <span className="mono">{a.acknowledged_by}</span>
                          </span>
                        ) : isGlobalAdmin ? (
                          <button className="small" onClick={() => acknowledge(a.id)}>
                            Acknowledge Risk
                          </button>
                        ) : (
                          <span className="status-chip status-warning">Open</span>
                        )
                      ])}
                    />
                  ) : (
                    <EmptyState
                      title="No open risk alerts"
                      message="No security alerts have been triggered. Alerts reflect live threat detections and are not simulated."
                    />
                  )}
                </section>
              )}

              {/* REMEDIATIONS */}
              {page === 'remediations' && (
                <section className="panel">
                  <PanelHeader title="Remediation Actions" source="APP / POSTGRES" onRefresh={refreshPage} />
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    Account containment and remediation actions executed through Keycloak Admin API.
                  </p>
                  {!pageData ? (
                    <LoadingSkeleton rows={5} />
                  ) : pageData.actions ? (
                    <Table
                      headers={['Timestamp', 'Remediation Action', 'Target Account', 'Authorized By', 'Rationale']}
                      rows={pageData.actions.map(a => [
                        <span className="mono">{new Date(a.created_at).toLocaleString()}</span>,
                        <StatusChip status={a.action} />,
                        <span className="mono" style={{ fontWeight: 600 }}>{a.target_username}</span>,
                        <span className="mono">{a.actor_username}</span>,
                        a.rationale
                      ])}
                    />
                  ) : (
                    <EmptyState title="No remediations" message="No administrative remediation actions have been taken." />
                  )}
                </section>
              )}

              {/* IAM CONFIGURATION */}
              {page === 'iam-config' && (
                <section className="panel">
                  <PanelHeader title="IAM Realm Configuration" source="KEYCLOAK" onRefresh={refreshPage} />
                  {!pageData ? (
                    <LoadingSkeleton rows={6} />
                  ) : pageData.realm ? (
                    <>
                      <Table
                        headers={['Security Parameter', 'Configured Value']}
                        rows={Object.entries(pageData)
                          .filter(([k]) => !['source', 'realm'].includes(k))
                          .map(([k, v]) => [
                            <span style={{ fontWeight: 600 }}>{k}</span>,
                            <span className="mono">{String(v ?? '—')}</span>
                          ])}
                      />
                      <form className="reviewform" onSubmit={savePolicy}>
                        <label>Update Realm Password Policy</label>
                        <select name="policy" defaultValue="standard">
                          <option value="standard">Standard Policy · 12+ Characters, Complexity Enforced</option>
                          <option value="strict">Strict Policy · 14+ Characters, High Entropy Required</option>
                        </select>
                        <button disabled={busy}>
                          {busy ? 'Updating Policy…' : 'Apply Password Policy'}
                        </button>
                      </form>
                    </>
                  ) : (
                    <EmptyState title="Configuration unavailable" message="Unable to load Keycloak realm configuration." />
                  )}
                </section>
              )}

              {/* PROTECTED RESOURCE AREAS */}
              {page.startsWith('resources/') && (
                <section className="panel">
                  <PanelHeader
                    title={`${page.split('/')[1]} Protected Resource`}
                    source="APP / AUTHORIZATION MIDDLEWARE"
                    onRefresh={refreshPage}
                  />
                  {pageData?.access ? (
                    <div style={{ padding: '24px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#065f46', marginBottom: '8px' }}>
                        <CheckCircle2 size={24} />
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Access Authorized</h3>
                      </div>
                      <p style={{ margin: 0, color: '#047857', fontSize: '13.5px' }}>
                        {pageData.message}. Department authorization was verified by the backend API security middleware.
                      </p>
                    </div>
                  ) : (
                    <AccessDenied
                      role={primaryRole}
                      page={page}
                      message="Access denied to this protected resource. The backend security middleware restricts access to accounts belonging to this department."
                    />
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Visual Components

function MetricCard({ label, value, icon, source }) {
  return (
    <section className="metric">
      <div className="metricicon">{icon}</div>
      <div className="metric-body">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {source && <SourceBadge source={source} />}
    </section>
  );
}

function PanelHeader({ title, source, onRefresh }) {
  return (
    <div className="panelhead">
      <div>
        <h2>{title}</h2>
      </div>
      <div className="paneltools">
        {source && <SourceBadge source={source} />}
        {onRefresh && (
          <button className="small secondary" onClick={onRefresh}>
            <RefreshCw size={12} />
            <span>Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell ?? '—'}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                No records found in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RoleChip({ role }) {
  if (!role) return null;
  const clean = role.toLowerCase();
  let variant = 'role-user';
  if (clean.includes('admin') || clean.includes('head')) variant = 'role-admin';
  else if (clean.includes('leader')) variant = 'role-leader';
  else if (clean.includes('manager')) variant = 'role-manager';
  else if (clean.includes('auditor') || clean.includes('read-only')) variant = 'role-auditor';

  return <span className={`role-chip ${variant}`}>{role}</span>;
}

function StatusChip({ status }) {
  if (!status) return null;
  const str = String(status).toUpperCase();
  let variant = 'status-neutral';

  if (['SUCCESS', 'APPROVE', 'APPROVED', 'ENABLED', 'GRANTED', 'TRUE'].includes(str)) {
    variant = 'status-success';
  } else if (['REVOKE', 'REVOKED', 'FAILURE', 'FAILED', 'LOGIN_ERROR', 'DENIED', 'DISABLED', 'CRITICAL', 'FALSE', 'DISABLE_USER'].includes(str)) {
    variant = 'status-danger';
  } else if (['INVESTIGATE', 'WARN', 'WARNING', 'HIGH'].includes(str)) {
    variant = 'status-warning';
  }

  return (
    <span className={`status-chip ${variant}`}>
      <span className="status-dot" />
      <span>{status}</span>
    </span>
  );
}

function SourceBadge({ source }) {
  if (!source) return null;
  const isKeycloak = source.includes('KEYCLOAK');
  const isApp = source.includes('APP') || source.includes('POSTGRES') || source.includes('MIDDLEWARE');

  let variant = 'source-app';
  if (isKeycloak && isApp) variant = 'source-combined';
  else if (isKeycloak) variant = 'source-keycloak';

  return <span className={`source ${variant}`}>{source}</span>;
}

function LoadingSkeleton({ rows = 5 }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-box" style={{ height: '36px', width: `${20 + (i % 3) * 15}%` }} />
          <div className="skeleton-box" style={{ height: '36px', flex: 1 }} />
          <div className="skeleton-box" style={{ height: '36px', width: '90px' }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Layers size={24} />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function AccessDenied({ role, page, requiredRoles, message }) {
  return (
    <div className="access-denied-card">
      <div className="access-denied-icon">
        <ShieldAlert size={28} />
      </div>
      <h2>Access Denied</h2>
      <p>
        {message || `You do not have sufficient privileges to access this page (${pageTitle(page)}).`}
      </p>
      <div style={{ marginBottom: '20px', fontSize: '12px', color: '#64748b' }}>
        Current Role: <RoleChip role={role} />
        {requiredRoles && (
          <div style={{ marginTop: '8px' }}>
            Required: {requiredRoles.join(' or ')}
          </div>
        )}
      </div>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <button className="secondary">
          <span>Return to Dashboard</span>
        </button>
      </Link>
    </div>
  );
}

function pageTitle(page) {
  const map = {
    dashboard: 'Security Dashboard',
    users: 'Identity & Access',
    reviews: 'Access Reviews',
    departments: 'Departments',
    audit: 'Keycloak Audit',
    'app-audit': 'Application Audit',
    alerts: 'Risk & Alerts',
    remediations: 'Remediations',
    'iam-config': 'IAM Configuration'
  };
  return map[page] || (page.startsWith('resources/') ? `${page.split('/')[1]} Resource` : 'Governance Portal');
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
