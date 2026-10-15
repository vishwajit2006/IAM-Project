import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const env = Object.fromEntries((fs.existsSync('.env') ? fs.readFileSync('.env','utf8') : '').split(/\r?\n/).filter(l=>l && !l.trim().startsWith('#') && l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const issuer=env.KC_PUBLIC_ISSUER||'http://localhost:8080/realms/ganpat-iam';
const password=env.DEMO_USER_PASSWORD;
if(!password) throw new Error('DEMO_USER_PASSWORD must be configured in the local .env file.');
const api='http://localhost:4000';
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext();
  const student=context.pages()[0]||await context.newPage();
  await student.goto('http://localhost:3001');
  await student.getByRole('button',{name:/sign in with university sso/i}).click();
  await student.locator('input[name="username"]').waitFor({timeout:20000});
  await student.locator('input[name="username"]').fill('stu.ict2');
  await student.locator('input[name="password"]').fill(password);
  await student.locator('input[name="login"]').click();
  await student.waitForURL('http://localhost:3001/**',{timeout:20000});
  await student.getByText(/welcome/i).waitFor({timeout:15000});
  const library=await context.newPage();
  await library.goto('http://localhost:3002');
  await library.getByText(/welcome/i).waitFor({timeout:15000});
  assert.equal(await library.getByRole('button',{name:/sign in with university sso/i}).count(),0,'second app showed a sign-in button');
  console.log('PASS: Student Portal login then Library Portal opened without credential prompt');
  await student.getByRole('button',{name:/sign out/i}).click();
  await student.waitForURL('http://localhost:3001/**',{timeout:20000});
  const tokenResponse=await fetch(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'iam-test-cli',username:'admin.priya',password})});
  assert.ok(tokenResponse.ok,`Admin test token failed with HTTP ${tokenResponse.status}`);
  const token=(await tokenResponse.json()).access_token;
  let empty=false;
  for(let i=0;i<10;i++) {
    const response=await fetch(`${api}/api/applications/sessions`,{headers:{authorization:`Bearer ${token}`}});
    assert.ok(response.ok,`Session list failed with HTTP ${response.status}`);
    const body=await response.json();
    empty=!(body.sessions||[]).some(s=>s.username==='stu.ict2' && ['student-portal','library-portal'].includes(s.clientId));
    if(empty)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.ok(empty,'Keycloak still lists a Student/Library session for stu.ict1 after logout');
  console.log('PASS: RP-initiated logout completed and Student/Library sessions are absent from live session list');
  await context.close();
} finally { await browser.close(); }
