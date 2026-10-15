import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import Keycloak from 'keycloak-js';
import { ShieldCheck, Users, Building2, ClipboardCheck, Activity, LogIn, LogOut, FileClock, Settings, Bell } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import './style.css';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const kc = new Keycloak({ url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080', realm: import.meta.env.VITE_KEYCLOAK_REALM || 'ganpat-iam', clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'iam-portal' });

function App() {
  const location = useLocation();
  const page = location.pathname.replace(/^\//, '') || 'dashboard';
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const roles = identity?.realm_access?.roles || [];
  const isGlobalAdmin = roles.includes('org-head') || roles.includes('iam-admin');

  useEffect(() => {
    kc.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false })
      .then(async authenticated => { if (authenticated) setIdentity(kc.tokenParsed); setReady(true); })
      .catch(e => { setError('Identity provider unavailable: ' + e.message); setReady(true); });
  }, []);

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
    try { setError(''); setDashboard(await api('/api/dashboard')); }
    catch (e) { setError(e.message); }
  }, [api]);

  const refreshPage = useCallback(async () => {
    if (!identity || page === 'dashboard') return;
    const route = page === 'users' ? '/api/users' : page === 'reviews' ? '/api/access-reviews' : page === 'departments' ? '/api/departments' : page === 'audit' ? '/api/audit/keycloak' : page === 'app-audit' ? '/api/audit/app' : page === 'alerts' ? '/api/alerts' : page === 'remediations' ? '/api/remediations' : page === 'iam-config' ? '/api/iam/config' : page.startsWith('resources/') ? `/api/resources/${encodeURIComponent(page.split('/')[1])}` : null;
    if (!route) { setPageData({ error: 'Page not found.' }); return; }
    try { setError(''); setPageData(await api(route)); }
    catch (e) { setPageData(null); setError(e.message); }
  }, [api, identity, page]);

  useEffect(() => { if (identity && page === 'dashboard') refreshDashboard(); else refreshPage(); }, [identity, page, refreshDashboard, refreshPage]);

  async function submitReview(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { setBusy(true); await api('/api/access-reviews', { method: 'POST', body: JSON.stringify({ subjectSub: form.get('subjectSub'), subjectUsername: form.get('subjectUsername'), department: form.get('department') || null, decision: form.get('decision'), rationale: form.get('rationale') }) }); event.currentTarget.reset(); await refreshPage(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function acknowledge(id) { try { await api(`/api/alerts/${id}/acknowledge`, { method: 'POST', body: '{}' }); await refreshPage(); } catch (e) { setError(e.message); } }
  async function setEnabled(user) { try { await api(`/api/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ enabled: !user.enabled }) }); await refreshPage(); } catch (e) { setError(e.message); } }
  async function remediate(user, action) { const rationale = window.prompt(`Reason for ${action.toLowerCase().replace('_',' ')} ${user.username}:`); if (!rationale) return; try { await api('/api/remediations', { method: 'POST', body: JSON.stringify({ subjectId: user.id, action, rationale }) }); await refreshPage(); } catch (e) { setError(e.message); } }
  async function savePolicy(event) { event.preventDefault(); const policy = new FormData(event.currentTarget).get('policy'); try { setBusy(true); await api('/api/iam/password-policy', { method: 'PUT', body: JSON.stringify({ policy }) }); await refreshPage(); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  return <div className="shell">
    <aside><div className="brand"><ShieldCheck size={27}/><div><b>GANPAT IAM</b><small>Governance Console</small></div></div>
      <nav><NavLink to="/" icon={<Activity/>} label="Overview"/><NavLink to="/users" icon={<Users/>} label="Identity & Access"/><NavLink to="/reviews" icon={<ClipboardCheck/>} label="Access Reviews"/><NavLink to="/departments" icon={<Building2/>} label="Departments"/><NavLink to="/audit" icon={<FileClock/>} label="Keycloak Audit"/><NavLink to="/app-audit" icon={<ShieldCheck/>} label="App Audit"/><NavLink to="/alerts" icon={<Bell/>} label="Risk & Alerts"/><NavLink to="/remediations" icon={<ShieldCheck/>} label="Remediations"/>{isGlobalAdmin && <NavLink to="/iam-config" icon={<Settings/>} label="IAM Configuration"/>}<div className="navlabel">PROTECTED AREAS</div>{['HR','IT','Finance'].map(d=><NavLink key={d} to={`/resources/${d}`} icon={<ShieldCheck/>} label={`${d} Resource`}/>)}</nav>
      <div className="sidefoot">2CSE507 · Sem VII<br/>Security by design</div>
    </aside>
    <main><header><div><span className="eyebrow">IDENTITY GOVERNANCE</span><h1>{pageTitle(page)}</h1></div>{identity ? <button onClick={() => kc.logout()}><LogOut size={16}/> Sign out</button> : <button onClick={() => kc.login()}><LogIn size={16}/> Sign in</button>}</header>
      {error && <div className="error">{error}</div>}
      {!ready ? <p>Connecting to Keycloak…</p> : !identity ? <section className="welcome"><ShieldCheck size={46}/><h2>One identity. Controlled access.</h2><p>Sign in through Keycloak. Authentication and MFA are handled by the identity provider, never by this application.</p><button onClick={() => kc.login()}>Sign in securely</button><small>Realm: ganpat-iam · OIDC Authorization Code + PKCE</small></section> : <>
        {page === 'dashboard' && <><section className="welcome compact"><div><span className="eyebrow">SIGNED IN AS</span><h2>{identity.name || identity.preferred_username}</h2><p>{identity.email || 'No email claim'} · {roles.filter(r => !['default-roles-ganpat-iam','offline_access','uma_authorization'].includes(r)).join(', ') || 'No realm roles'}</p></div><button onClick={refreshDashboard}>Refresh</button></section><div className="cards"><Metric label="Keycloak users" value={dashboard?.metrics?.keycloakUsers ?? '—'} icon={<Users/>}/><Metric label="Access reviews" value={dashboard?.metrics?.accessReviews ?? '—'} icon={<ClipboardCheck/>}/><Metric label="Open alerts" value={dashboard?.metrics?.openAlerts ?? '—'} icon={<Activity/>}/><Metric label="App audit events" value={dashboard?.metrics?.appAuditEvents ?? '—'} icon={<ShieldCheck/>}/></div><section className="panel"><div className="panelhead"><div><h2>Department membership</h2><p>Live department membership from Keycloak and governance metrics from Postgres.</p></div><span className="source">SOURCE: KEYCLOAK + APP</span></div><ResponsiveContainer width="100%" height={260}><BarChart data={dashboard?.departmentUsers || []}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="users" fill="#4f46e5" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer><p className="note">User counts are derived from Keycloak Admin REST API group memberships.</p></section></>}
        {page === 'users' && <section className="panel"><PanelHeader title="Identity directory" source="KEYCLOAK" onRefresh={refreshPage}/><p>Department-scoped listing. User permissions are enforced by the API, not this table.</p>{pageData?.users ? <Table headers={['Username','Name','Email','Department','Roles','Status','Action']} rows={pageData.users.map(u=>[u.username,`${u.firstName||''} ${u.lastName||''}`.trim(),u.email||'—',u.department||'—',(u.realmRoles||[]).join(', '),u.enabled?'Enabled':'Disabled',<div className="actions">{!roles.includes('manager') && <button className="small" onClick={()=>setEnabled(u)}>{u.enabled?'Disable':'Enable'}</button>}{isGlobalAdmin && <button className="small secondary" onClick={()=>remediate(u,u.enabled?'DISABLE_USER':'ENABLE_USER')}>Remediate</button>}</div>])}/> : <p>Loading directory…</p>}</section>}
        {page === 'reviews' && <><section className="panel"><PanelHeader title="Access review decisions" source="APP / POSTGRES" onRefresh={refreshPage}/>{isGlobalAdmin && <form className="reviewform" onSubmit={submitReview}><input name="subjectSub" required placeholder="Keycloak user ID (sub)"/><input name="subjectUsername" required placeholder="Username"/><input name="department" placeholder="Department (optional)"/><select name="decision"><option>APPROVE</option><option>REVOKE</option><option>INVESTIGATE</option></select><textarea name="rationale" required minLength="5" placeholder="Rationale for this decision"/><button disabled={busy}>{busy?'Saving…':'Record decision'}</button></form>}</section><section className="panel"><h2>Review history</h2>{pageData?.reviews ? <Table headers={['User','Department','Decision','Reviewer','Rationale','Created']} rows={pageData.reviews.map(r=>[r.subject_username,r.department||'—',r.decision,r.reviewer_username,r.rationale,new Date(r.created_at).toLocaleString()])}/> : <p>Loading review history…</p>}</section></>}
        {page === 'departments' && <section className="panel"><PanelHeader title="Department directory" source="APP / POSTGRES" onRefresh={refreshPage}/>{pageData?.departments ? <Table headers={['Code','Department','Keycloak group']} rows={pageData.departments.map(d=>[d.code,d.name,d.keycloak_group_path])}/> : <p>Loading departments…</p>}</section>}
        {page === 'audit' && <section className="panel"><PanelHeader title="Keycloak native events" source="KEYCLOAK" onRefresh={refreshPage}/><p>Native authentication and admin events. These are not app audit events.</p>{pageData?.events ? <Table headers={['Time','Type','Client','User','IP']} rows={[...pageData.events].map(e=>[e.time ? new Date(e.time).toLocaleString() : '—',e.type||'—',e.clientId||'—',e.username||e.userId||'—',e.ipAddress||'—'])}/> : <p>Loading Keycloak events…</p>}{pageData?.adminEvents && <><h2>Keycloak admin events</h2><Table headers={['Time','Operation','Resource','User','Client IP']} rows={pageData.adminEvents.map(e=>[e.time ? new Date(e.time).toLocaleString() : '—',e.operationType||'—',e.resourceType||'—',e.authDetails?.username||e.authDetails?.userId||'—',e.authDetails?.ipAddress||'—'])}/></>}</section>}
        {page === 'app-audit' && <section className="panel"><PanelHeader title="Application audit events" source="APP / POSTGRES" onRefresh={refreshPage}/>{pageData?.events ? <Table headers={['Time','Actor','Action','Target','Department','Outcome']} rows={pageData.events.map(e=>[new Date(e.created_at).toLocaleString(),e.actor_username,e.action,e.target||'—',e.department||'—',e.outcome])}/> : <p>Loading app audit…</p>}</section>}
        {page === 'alerts' && <section className="panel"><PanelHeader title="Risk and alert register" source="APP / POSTGRES" onRefresh={refreshPage}/>{pageData?.alerts ? <Table headers={['Severity','Kind','Message','Created','Acknowledgement']} rows={pageData.alerts.map(a=>[a.severity,a.kind,a.message,new Date(a.created_at).toLocaleString(),a.acknowledged_at ? `Acknowledged by ${a.acknowledged_by}` : isGlobalAdmin ? <button className="small" onClick={()=>acknowledge(a.id)}>Acknowledge</button> : 'Open'])}/> : <p>No alert data loaded. Alerts are not fabricated; the table is empty until real app records exist.</p>}</section>}
        {page === 'remediations' && <section className="panel"><PanelHeader title="Remediation history" source="APP / POSTGRES" onRefresh={refreshPage}/>{pageData?.actions ? <Table headers={['Time','Action','Target','Actor','Rationale']} rows={pageData.actions.map(a=>[new Date(a.created_at).toLocaleString(),a.action,a.target_username,a.actor_username,a.rationale])}/> : <p>Loading remediation history…</p>}</section>}
        {page === 'iam-config' && <section className="panel"><PanelHeader title="IAM configuration" source="KEYCLOAK" onRefresh={refreshPage}/>{pageData?.realm ? <><Table headers={['Setting','Value']} rows={Object.entries(pageData).filter(([k])=>!['source','realm'].includes(k)).map(([k,v])=>[k,String(v??'—')])}/><form className="reviewform" onSubmit={savePolicy}><label>Set password policy</label><select name="policy"><option value="standard">Standard · 12+ characters</option><option value="strict">Strict · 14+ characters</option></select><button disabled={busy}>{busy?'Saving…':'Update policy'}</button></form></> : <p>Loading IAM configuration…</p>}</section>}
        {page.startsWith('resources/') && <section className="panel"><PanelHeader title={`${page.split('/')[1]} protected resource`} source="APP / AUTHORIZATION MIDDLEWARE" onRefresh={refreshPage}/>{pageData?.access ? <p>{pageData.message}. Department authorization was checked by the backend.</p> : <p>Access denied or resource unavailable. The backend enforces department membership.</p>}</section>}
      </>}
    </main>
  </div>;
}
function NavLink({to,icon,label}) { return <Link to={to}>{icon}{label}</Link>; }
function Metric({label,value,icon}) { return <section className="metric"><div className="metricicon">{icon}</div><span>{label}</span><strong>{value}</strong></section>; }
function PanelHeader({title,source,onRefresh}) { return <div className="panelhead"><div><h2>{title}</h2></div><div className="paneltools"><span className="source">{source}</span><button className="small secondary" onClick={onRefresh}>Refresh</button></div></div>; }
function Table({headers,rows}) { return <div className="tablewrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell ?? '—'}</td>)}</tr>) : <tr><td colSpan={headers.length}>No records found.</td></tr>}</tbody></table></div>; }
function pageTitle(page) { return ({dashboard:'Security Dashboard',users:'Identity & Access',reviews:'Access Reviews',departments:'Departments',audit:'Keycloak Audit', 'app-audit':'Application Audit',alerts:'Risk & Alerts',remediations:'Remediations','iam-config':'IAM Configuration'})[page] || (page.startsWith('resources/') ? `${page.split('/')[1]} Resource` : 'Governance'); }
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
