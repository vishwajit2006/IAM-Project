import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { z } from 'zod';
import { authenticate, requireAnyRole, requireReadOnlyForWrites, requireDepartment } from './security.js';
import { kcAdmin, getUserWithGroups } from './keycloak-admin.js';

const app = express();
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(x=>x.trim());
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin(origin,cb){ if(!origin || allowedOrigins.includes(origin)) return cb(null,true); cb(new Error('Origin not allowed')); }, credentials:false}));
app.use(express.json({limit:'256kb'}));
app.use(rateLimit({windowMs:60_000,limit:120,standardHeaders:true,legacyHeaders:false}));
app.get('/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({status:'ok',database:'ok'}); }
  catch { res.status(503).json({status:'degraded',database:'unavailable'}); }
});
app.use('/api', authenticate, requireReadOnlyForWrites);
app.get('/api/me',(req,res)=>res.json({identity:req.identity}));
app.patch('/api/me', async(req,res)=>{
  const parsed=z.object({firstName:z.string().trim().min(1).max(100).optional(),lastName:z.string().trim().min(1).max(100).optional(),email:z.string().email().max(254).optional()}).strict().safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'Invalid input',issues:parsed.error.issues});
  if(!Object.keys(parsed.data).length) return res.status(400).json({error:'At least one editable field is required'});
  try {
    const user=await kcAdmin(`/users/${encodeURIComponent(req.identity.sub)}`);
    await kcAdmin(`/users/${encodeURIComponent(req.identity.sub)}`,{method:'PUT',body:JSON.stringify({...user,...parsed.data})});
    await auditAction(req.identity,'OWN_PROFILE_UPDATED',user.username,null,{fields:Object.keys(parsed.data)});
    res.json({updated:true,message:'Profile updated. Sign in again to refresh displayed token claims.'});
  } catch(e) { res.status(502).json({error:'Unable to update own profile',detail:e.message}); }
});
app.get('/api/departments', requireAnyRole('org-head','iam-admin','dept-leader','manager','read-only'), async (_req,res)=>{
  const {rows}=await pool.query('SELECT code,name,keycloak_group_path FROM departments ORDER BY name');
  res.json({source:'APP',departments:rows});
});
app.get('/api/dashboard', requireAnyRole('org-head','iam-admin','dept-leader','manager','read-only'), async(req,res)=>{
  // Counts originate in the app DB; Keycloak-native events are fetched separately by the event endpoint.
  const [reviews, alerts, audits, depts] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM access_reviews'),
    pool.query('SELECT count(*)::int AS count FROM alerts WHERE acknowledged_at IS NULL'),
    pool.query('SELECT count(*)::int AS count FROM app_audit_events'),
    pool.query('SELECT code,name,keycloak_group_path FROM departments ORDER BY name')
  ]);
  try { const [keycloakUsers, users] = await Promise.all([kcAdmin('/users/count'), kcAdmin('/users?max=200&briefRepresentation=false')]); const groupsByUser = await Promise.all((users||[]).map(u => kcAdmin(`/users/${encodeURIComponent(u.id)}/groups`))); const departmentUsers = depts.rows.map(d => { const groupName=d.keycloak_group_path.split('/').at(-1); const count=groupsByUser.filter(gs => (gs||[]).some(g => g.path===d.keycloak_group_path)).length; return {code:d.code,name:groupName,users:count}; }); res.json({sources:{app:'APP',identity:'KEYCLOAK'},metrics:{accessReviews:reviews.rows[0].count,openAlerts:alerts.rows[0].count,appAuditEvents:audits.rows[0].count,keycloakUsers:Number(keycloakUsers)},departments:depts.rows,departmentUsers});

} catch (e) {
  console.error('[Dashboard Keycloak Admin API error]', e);
  res.status(503).json({
    error: 'Keycloak Admin API unavailable; dashboard counts not fabricated'
  });
}
});

function hasGlobalUserAdmin(identity) { return identity.roles.includes('org-head') || identity.roles.includes('iam-admin'); }
function ownDepartmentGroup(identity) { return identity.groups.find(g => g.startsWith('/Departments/')) || ''; }
function userInDepartment(user, department) { return (user.groups || []).includes(`/Departments/${department}`); }
function canManageTarget(identity, user) {
  if (hasGlobalUserAdmin(identity)) return true;
  const group = ownDepartmentGroup(identity);
  if (!group || !(user.groups || []).includes(group)) return false;
  if (identity.roles.includes('dept-leader')) return true;
  return identity.roles.includes('manager') && (user.realmRoles || []).includes('employee');
}
async function auditAction(identity, action, target, department, details={}) {
  await pool.query('INSERT INTO app_audit_events(source,actor_sub,actor_username,action,target,department,details) VALUES($1,$2,$3,$4,$5,$6,$7)', ['APP',identity.sub,identity.username,action,target,department||null,JSON.stringify(details)]);
}
app.get('/api/users', requireAnyRole('iam-admin','org-head','dept-leader','manager','read-only'), async(req,res)=>{
  try {
    const raw = await kcAdmin('/users?max=200&briefRepresentation=false');
    const enriched = await Promise.all((raw||[]).map(u=>getUserWithGroups(u.id)));
    const global = hasGlobalUserAdmin(req.identity);
    const ownGroup = ownDepartmentGroup(req.identity);
    const scoped = global ? enriched : enriched.filter(u => ownGroup && (u.groups||[]).includes(ownGroup) && (!req.identity.roles.includes('manager') || (u.realmRoles||[]).includes('employee')));
    res.json({source:'KEYCLOAK',users:scoped.map(u=>({id:u.id,username:u.username,email:u.email,firstName:u.firstName,lastName:u.lastName,enabled:u.enabled,department:u.attributes?.department?.[0]||null,groups:u.groups,realmRoles:u.realmRoles}))});
  } catch(e) { res.status(502).json({error:'Unable to read Keycloak users',detail:e.message}); }
});
app.patch('/api/users/:id', async(req,res)=>{
  const schema=z.object({firstName:z.string().trim().min(1).max(100).optional(),lastName:z.string().trim().min(1).max(100).optional(),email:z.string().email().max(254).optional(),enabled:z.boolean().optional()}).strict();
  const parsed=schema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Invalid input',issues:parsed.error.issues});
  if(!Object.keys(parsed.data).length) return res.status(400).json({error:'At least one editable field is required'});
  try {
    const target=await getUserWithGroups(req.params.id);
    if(!canManageTarget(req.identity,target)) return res.status(403).json({error:'Forbidden: you can only update accounts in your own department'});
    if(req.identity.roles.includes('manager') && !hasGlobalUserAdmin(req.identity) && parsed.data.enabled === false) return res.status(403).json({error:'Forbidden: managers may update employee details but cannot disable accounts'});
    const current=await kcAdmin(`/users/${encodeURIComponent(req.params.id)}`);
    const updated={...current,...parsed.data};
    await kcAdmin(`/users/${encodeURIComponent(req.params.id)}`,{method:'PUT',body:JSON.stringify(updated)});
    await auditAction(req.identity,'USER_UPDATED',target.username,target.attributes?.department?.[0],{fields:Object.keys(parsed.data)});
    res.json({source:'KEYCLOAK',id:target.id,updated:true});
  } catch(e) { res.status(502).json({error:'Unable to update Keycloak account',detail:e.message}); }
});
app.post('/api/users/:id/reset-password', async(req,res)=>{
  const schema=z.object({password:z.string().min(12).max(128)}).strict();
  const parsed=schema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Invalid input',issues:parsed.error.issues});
  try {
    const target=await getUserWithGroups(req.params.id);
    const global=hasGlobalUserAdmin(req.identity);
    if(!global && !(req.identity.roles.includes('dept-leader') && canManageTarget(req.identity,target))) return res.status(403).json({error:'Forbidden: password reset is limited to IAM admins or leaders in the target account department'});
    await kcAdmin(`/users/${encodeURIComponent(req.params.id)}/reset-password`,{method:'PUT',body:JSON.stringify({type:'password',value:parsed.data.password,temporary:true})});
    await auditAction(req.identity,'PASSWORD_RESET_REQUESTED',target.username,target.attributes?.department?.[0],{temporary:true});
    res.json({source:'KEYCLOAK',reset:true,temporary:true,message:'Temporary password set; user must change it at next login'});
  } catch(e) { res.status(502).json({error:'Unable to reset Keycloak password',detail:e.message}); }
});
app.delete('/api/users/:id', async(req,res)=>{
  if(!hasGlobalUserAdmin(req.identity)) return res.status(403).json({error:'Forbidden: department leaders and managers cannot delete users'});
  try {
    const target=await kcAdmin(`/users/${encodeURIComponent(req.params.id)}`);
    await kcAdmin(`/users/${encodeURIComponent(req.params.id)}`,{method:'DELETE'});
    await auditAction(req.identity,'USER_DELETED',target.username,target.attributes?.department?.[0]);
    res.status(204).end();
  } catch(e) { res.status(502).json({error:'Unable to delete Keycloak account',detail:e.message}); }
});
app.get('/api/alerts', requireAnyRole('iam-admin','org-head','read-only'), async(_req,res)=>{
  const {rows}=await pool.query('SELECT id,kind,severity,message,acknowledged_by,acknowledged_at,created_at FROM alerts ORDER BY created_at DESC LIMIT 500');
  res.json({source:'APP',alerts:rows});
});
app.get('/api/iam/config', requireAnyRole('iam-admin','org-head'), async(_req,res)=>{
  try {
    const [realm,events]=await Promise.all([kcAdmin(''),kcAdmin('/events/config')]);
    res.json({source:'KEYCLOAK',realm:realm.realm,displayName:realm.displayName,passwordPolicy:realm.passwordPolicy,bruteForceProtected:realm.bruteForceProtected,failureFactor:realm.failureFactor,waitIncrementSeconds:realm.waitIncrementSeconds,eventsEnabled:events?.eventsEnabled,adminEventsEnabled:events?.adminEventsEnabled});
  } catch(e) { res.status(502).json({error:'Unable to read IAM configuration',detail:e.message}); }
});
app.put('/api/iam/password-policy', requireAnyRole('iam-admin','org-head'), async(req,res)=>{
  const parsed=z.object({policy:z.enum(['standard','strict'])}).strict().safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'policy must be standard or strict'});
  const policy=parsed.data.policy==='strict'?'length(14) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1)':'length(12) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1)';
  try {
    const realm=await kcAdmin('');
    await kcAdmin('',{method:'PUT',body:JSON.stringify({...realm,passwordPolicy:policy})});
    await auditAction(req.identity,'IAM_PASSWORD_POLICY_CHANGED',realm.realm,null,{policy:parsed.data.policy});
    res.json({source:'KEYCLOAK',updated:true,policy:parsed.data.policy,passwordPolicy:policy});
  } catch(e) { res.status(502).json({error:'Unable to update IAM password policy',detail:e.message}); }
});
app.get('/api/audit/keycloak', requireAnyRole('iam-admin','org-head','read-only'), async(req,res)=>{
  const limit=Math.min(Number(req.query.limit)||100,500);
  try {
    const [events,adminEvents]=await Promise.all([
      kcAdmin(`/events?max=${limit}`),
      kcAdmin(`/admin-events?max=${limit}`)
    ]);
    res.json({source:'KEYCLOAK',events:events||[],adminEvents:adminEvents||[]});
  } catch(e) { res.status(502).json({error:'Unable to read Keycloak-native events',detail:e.message}); }
});
app.get('/api/audit/app', requireAnyRole('iam-admin','org-head','read-only'), async(req,res)=>{
 const limit = Math.min(Number(req.query.limit)||100,500);
 const {rows}=await pool.query('SELECT id,source,actor_username,action,target,department,outcome,details,created_at FROM app_audit_events ORDER BY created_at DESC LIMIT $1',[limit]);
 res.json({source:'APP',events:rows});
});
app.get('/api/access-reviews', requireAnyRole('iam-admin','org-head','read-only'), async(_req,res)=>{
  const {rows}=await pool.query('SELECT id,subject_sub,subject_username,department,decision,rationale,reviewer_username,created_at FROM access_reviews ORDER BY created_at DESC LIMIT 500');
  res.json({source:'APP',reviews:rows});
});
app.post('/api/access-reviews', requireAnyRole('iam-admin','org-head'), async(req,res)=>{
 const schema=z.object({subjectSub:z.string().min(1).max(200),subjectUsername:z.string().min(1).max(100),department:z.string().max(100).optional().nullable(),decision:z.enum(['APPROVE','REVOKE','INVESTIGATE']),rationale:z.string().min(5).max(2000)});
 const parsed=schema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Invalid input',issues:parsed.error.issues});
 const d=parsed.data;
 const result=await pool.query('INSERT INTO access_reviews(subject_sub,subject_username,department,decision,rationale,reviewer_sub,reviewer_username) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d.subjectSub,d.subjectUsername,d.department||null,d.decision,d.rationale,req.identity.sub,req.identity.username]);
 await pool.query('INSERT INTO app_audit_events(source,actor_sub,actor_username,action,target,department,details) VALUES($1,$2,$3,$4,$5,$6,$7)', ['APP',req.identity.sub,req.identity.username,'ACCESS_REVIEW_'+d.decision,d.subjectUsername,d.department||null,JSON.stringify({rationale:d.rationale})]);
 res.status(201).json({source:'APP',review:result.rows[0]});
});
app.get('/api/resources/student', requireAnyRole('student'), (req,res)=>res.json({area:'student',access:'granted',subject:req.identity.sub,message:'Student resource area authorized by backend',source:'APP'}));
app.get('/api/resources/library', requireAnyRole('student','faculty','employee','manager','dept-leader','iam-admin','org-head'), (req,res)=>res.json({area:'library',access:'granted',subject:req.identity.sub,message:'Library resource area authorized by backend',source:'APP'}));
app.get('/api/resources/:department', requireDepartment, (req,res)=>{
 const department=req.params.department;
 if(!['HR','IT','Finance'].includes(department)) return res.status(404).json({error:'Protected resource not found'});
 res.json({department,access:'granted',message:`Protected ${department} resource area`,source:'APP'});
});
app.get('/api/remediations', requireAnyRole('iam-admin','org-head','read-only'), async(_req,res)=>{
  const {rows}=await pool.query('SELECT id,action,target_sub,target_username,rationale,actor_username,created_at FROM remediation_actions ORDER BY created_at DESC LIMIT 500');
  res.json({source:'APP',actions:rows});
});
app.post('/api/remediations', requireAnyRole('iam-admin','org-head'), async(req,res)=>{
  const parsed=z.object({subjectId:z.string().min(1).max(200),action:z.enum(['DISABLE_USER','ENABLE_USER']),rationale:z.string().min(5).max(2000)}).strict().safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'Invalid input',issues:parsed.error.issues});
  try {
    const target=await kcAdmin(`/users/${encodeURIComponent(parsed.data.subjectId)}`);
    await kcAdmin(`/users/${encodeURIComponent(parsed.data.subjectId)}`,{method:'PUT',body:JSON.stringify({...target,enabled:parsed.data.action==='ENABLE_USER'})});
    const {rows}=await pool.query('INSERT INTO remediation_actions(action,target_sub,target_username,rationale,actor_sub,actor_username) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[parsed.data.action,target.id,target.username,parsed.data.rationale,req.identity.sub,req.identity.username]);
    await auditAction(req.identity,'REMEDIATION_'+parsed.data.action,target.username,target.attributes?.department?.[0],{rationale:parsed.data.rationale});
    res.status(201).json({source:'APP',action:rows[0]});
  } catch(e) { res.status(502).json({error:'Remediation failed; verify Keycloak state before retrying',detail:e.message}); }
});
app.post('/api/alerts/:id/acknowledge', requireAnyRole('iam-admin','org-head'), async(req,res)=>{
 const idSchema=z.coerce.number().int().positive(); const parsed=idSchema.safeParse(req.params.id);
 if(!parsed.success) return res.status(400).json({error:'Invalid alert id'});
 const {rows}=await pool.query('UPDATE alerts SET acknowledged_by=$1,acknowledged_at=now() WHERE id=$2 RETURNING *',[req.identity.username,parsed.data]);
 if(!rows.length) return res.status(404).json({error:'Alert not found'});
 await pool.query('INSERT INTO app_audit_events(source,actor_sub,actor_username,action,target,details) VALUES($1,$2,$3,$4,$5,$6)',['APP',req.identity.sub,req.identity.username,'ALERT_ACKNOWLEDGED',String(parsed.data),JSON.stringify({alertId:parsed.data})]);
 res.json({source:'APP',alert:rows[0]});
});
app.use((err,_req,res,_next)=>{console.error(err.message);res.status(500).json({error:'Internal server error'});});
const port=Number(process.env.PORT)||4000;
app.listen(port,'0.0.0.0',()=>console.log(`IAM API listening on ${port}`));
