#!/usr/bin/env node
/**
 * End-to-end Phase 1 acceptance runner. Run from the project root after copying
 * .env.example to .env. It starts the full stack and reports observed PASS/FAIL.
 * Requires Docker Compose v2, Node 20+, and curl is not required (fetch is built in).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const checks = [];
const record = (name, pass, detail) => checks.push({ name, result: pass ? 'PASS' : 'FAIL', detail });
const env = Object.fromEntries((fs.existsSync('.env') ? fs.readFileSync('.env','utf8') : '').split(/\r?\n/).filter(line=>line && !line.trim().startsWith('#') && line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const base = 'http://localhost:4000';
const issuer = env.KC_PUBLIC_ISSUER || 'http://localhost:8080/realms/ganpat-iam';
const demoPassword = env.DEMO_USER_PASSWORD;
const serviceSecret = env.IAM_SERVICE_CLIENT_SECRET;
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function json(url, options={}) { const response=await fetch(url,options); let body=null; try{body=await response.json();}catch{} return {response,body}; }
async function token(username,password,clientId='iam-test-cli') {
  const body=new URLSearchParams({grant_type:'password',client_id:clientId,username,password});
  const result=await json(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!result.response.ok || !result.body?.access_token) throw new Error(`token for ${username} failed: HTTP ${result.response.status}`);
  return result.body.access_token;
}
async function api(path,accessToken,method='GET',body) {
  return json(base+path,{method,headers:{authorization:`Bearer ${accessToken}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
async function getUsers(adminToken) { const r=await api('/api/users',adminToken); if(!r.response.ok) throw new Error('Could not read users'); return r.body.users; }

console.log('Phase 1 acceptance checks: starting Docker Compose stack...');
const up=spawnSync('docker',['compose','up','--build','-d'],{encoding:'utf8',timeout:900000});
if(up.error || up.status!==0) {
  const why=(up.error?.message||up.stderr||up.stdout||`exit ${up.status}`).trim();
  record('1. docker compose up --build reaches healthy',false,why);
  for(const name of ['2. Student token resource authorization','3. User lifecycle permission matrix','4. Read-only PUT denial','5. Tampered/expired/wrong-audience tokens','6. Keycloak weak-password rejection','7. Cross-app SSO and logout session removal','8. Native LOGIN and LOGIN_ERROR events']) record(name,false,`Not run because the Compose stack did not start: ${why}`);
  printReport(); process.exitCode=1; process.exit();
}
let healthy=false;
for(let i=0;i<90;i++) {
  const ps=spawnSync('docker',['compose','ps','--format','json'],{encoding:'utf8'});
  try { const raw=ps.stdout.trim(); let rows=[]; try { const parsed=JSON.parse(raw); rows=Array.isArray(parsed)?parsed:[parsed]; } catch { rows=raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x)); } const required=['postgres','keycloak','openldap','backend','portal','student-portal','library-portal','saml-sp']; healthy=required.every(name=>{const row=rows.find(r=>(r.Service||r.Name||'').includes(name));return row && row.Health==='healthy';}); if(healthy)break; } catch {}
  await wait(2000);
}
record('1. docker compose up --build reaches healthy',healthy,healthy?'Required services report running/healthy':'One or more services did not become ready; inspect docker compose ps and logs');
if(!healthy){printReport();process.exitCode=1;process.exit();}
let studentToken,leaderToken,adminToken,readOnlyToken;
try {
  studentToken=await token('stu.ict1',demoPassword);
  const student=await api('/api/resources/student',studentToken);
  record('2a. stu.ict1 GET /api/resources/student -> 200',student.response.status===200,`HTTP ${student.response.status}`);
  const adminResource=await api('/api/resources/admin',studentToken);
  record('2b. stu.ict1 GET /api/resources/admin -> 403',adminResource.response.status===403,`HTTP ${adminResource.response.status}`);
  leaderToken=await token('leader.ict',demoPassword);
  adminToken=await token('admin.priya',demoPassword);
  readOnlyToken=await token('ro.audit',demoPassword);
  const users=await getUsers(adminToken);
  const stuIct=users.find(u=>u.username==='stu.ict1'); const stuEc=users.find(u=>u.username==='stu.ec1');
  const ictReset=await api(`/api/users/${encodeURIComponent(stuIct.id)}/reset-password`,leaderToken,'POST',{password:'Temp-Ict-Password-2026!'});
  record('3a. leader.ict resets stu.ict1 -> 200',ictReset.response.status===200,`HTTP ${ictReset.response.status}`);
  const ecReset=await api(`/api/users/${encodeURIComponent(stuEc.id)}/reset-password`,leaderToken,'POST',{password:'Temp-Ec-Password-2026!'});
  record('3b. leader.ict resets stu.ec1 -> 403',ecReset.response.status===403,`HTTP ${ecReset.response.status}`);
  const leaderDelete=await api(`/api/users/${encodeURIComponent(stuIct.id)}`,leaderToken,'DELETE');
  record('3c. leader.ict DELETE stu.ict1 -> 403',leaderDelete.response.status===403,`HTTP ${leaderDelete.response.status}`);
  const create=await api('/api/users',adminToken,'POST',{username:`phase1.throwaway.${Date.now()}`,firstName:'Phase1',lastName:'Throwaway',email:`phase1.throwaway.${Date.now()}@ganpat.edu`,department:'ICT',role:'student',temporaryPassword:'Throwaway-Temp-2026!'});
  let deleteStatus=0;
  if(create.response.status===201) { const del=await api(`/api/users/${encodeURIComponent(create.body.id)}`,adminToken,'DELETE'); deleteStatus=del.response.status; }
  record('3d. admin.priya DELETE throwaway user -> 200',deleteStatus===200,`HTTP ${deleteStatus}`);
  const roUsers=await api('/api/users',adminToken); const targetId=roUsers.body.users.find(u=>u.username==='stu.ict2')?.id;
  const roPut=await api(`/api/users/${encodeURIComponent(targetId||'nonexistent')}`,readOnlyToken,'PUT',{enabled:false});
  record('4. ro.audit PUT any user -> 403',roPut.response.status===403,`HTTP ${roPut.response.status}`);
  const tampered=studentToken.slice(0,-4)+'ABCD';
  const tamperResult=await api('/api/me',tampered);
  record('5a. tampered token -> 401',tamperResult.response.status===401,`HTTP ${tamperResult.response.status}`);
  let expiredPass=false;
  // Use a signed JWT with an expired exp only when a short-lifespan token can be minted; otherwise report a genuine failure rather than fabricate a pass.
  const realmAdmin=await json(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:'portal-admin-svc',client_secret:serviceSecret})});
  if(realmAdmin.response.ok) {
    const adminAccess=realmAdmin.body.access_token;
    const realmGet=await json(`${issuer.replace('/realms/ganpat-iam','')}/admin/realms/ganpat-iam`,{headers:{authorization:`Bearer ${adminAccess}`} });
    if(realmGet.response.ok) {
      const oldLife=realmGet.body.accessTokenLifespan||300;
      await json(`${issuer.replace('/realms/ganpat-iam','')}/admin/realms/ganpat-iam`,{method:'PUT',headers:{authorization:`Bearer ${adminAccess}`,'content-type':'application/json'},body:JSON.stringify({...realmGet.body,accessTokenLifespan:1})});
      const short=await token('stu.ict2',demoPassword); await wait(1800); const expired=await api('/api/me',short); expiredPass=expired.response.status===401;
      const restoreToken=await json(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:'portal-admin-svc',client_secret:serviceSecret})});
      if(restoreToken.response.ok) await json(`${issuer.replace('/realms/ganpat-iam','')}/admin/realms/ganpat-iam`,{method:'PUT',headers:{authorization:`Bearer ${restoreToken.body.access_token}`,'content-type':'application/json'},body:JSON.stringify({...realmGet.body,accessTokenLifespan:oldLife})});
    }
  }
  record('5b. expired token -> 401',expiredPass,expiredPass?'HTTP 401':'Could not perform short-lifespan signed-token check');
  const wrongAud=await json(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:'portal-admin-svc',client_secret:serviceSecret})});
  const wrong=wrongAud.body?.access_token ? await api('/api/me',wrongAud.body.access_token) : {response:{status:0}};
  record('5c. wrong audience token -> 401',wrong.response.status===401,`HTTP ${wrong.response.status}`);
  const weak=await api(`/api/users/${encodeURIComponent(stuIct.id)}/reset-password`,adminToken,'POST',{password:'weak'});
  record('6. weak password rejected by Keycloak policy',weak.response.status===400 && weak.body?.error==='PASSWORD_POLICY_REJECTED',`HTTP ${weak.response.status}; ${weak.body?.error||'no error code'}`);
  await json(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'iam-test-cli',username:'stu.ict1',password:'definitely-wrong-password'})});
  const events=await api('/api/audit/keycloak?limit=100',adminToken);
  const eventTypes=new Set((events.body?.events||[]).map(e=>e.type));
  record('8. Keycloak native LOGIN/LOGIN_ERROR events retrievable',events.response.ok && eventTypes.has('LOGIN') && eventTypes.has('LOGIN_ERROR'),`HTTP ${events.response.status}; found ${[...eventTypes].filter(x=>x==='LOGIN'||x==='LOGIN_ERROR').join(',')||'neither event type in latest 100'}`);
  const sso=spawnSync(process.execPath,['tests/sso.playwright.mjs'],{encoding:'utf8',timeout:180000});
  record('7. SSO second-app no-prompt and logout clears sessions',sso.status===0,(sso.stdout+'\n'+sso.stderr).trim() || (sso.error?.message||`exit ${sso.status}`));
} catch(e) {
  record('Runtime acceptance sequence',false,e.message);
}
printReport();
function printReport(){
  console.log('\n| Acceptance check | Result | Observed output |');
  console.log('|---|---|---|');
  for(const c of checks) console.log(`| ${c.name} | **${c.result}** | ${String(c.detail).replaceAll('|','\\|').replaceAll('\n',' ')} |`);
  const pass=checks.filter(c=>c.result==='PASS').length; console.log(`\nTotal: ${pass}/${checks.length} PASS`);
}
