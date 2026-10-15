import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const realm=JSON.parse(fs.readFileSync(path.join(root,'keycloak/realm/ganpat-iam-realm.json'),'utf8'));
test('realm import JSON parses and has required realm',()=>assert.equal(realm.realm,'ganpat-iam'));
test('seeded account count and required named accounts',()=>{assert.equal(realm.users.length,18);for(const u of ['head.ganpat','admin.priya','admin.rahul','mfa.admin','mfa.test','ro.audit'])assert.ok(realm.users.some(x=>x.username===u),u)});
test('required realm roles exist',()=>{const roles=realm.roles.realm.map(r=>r.name);for(const r of ['org-head','iam-admin','dept-leader','manager','employee','faculty','student','read-only','mfa-required','portal-api-access'])assert.ok(roles.includes(r),r)});
test('all six department groups exist with attributes',()=>{const gs=realm.groups[0].subGroups;assert.equal(gs.length,6);for(const g of gs)assert.ok(g.attributes.department?.[0]===g.name)});
test('clients use public PKCE and no direct grant',()=>{for(const id of ['iam-portal','student-portal','library-portal']){const c=realm.clients.find(x=>x.clientId===id);assert.ok(c);assert.equal(c.publicClient,true);assert.equal(c.directAccessGrantsEnabled,false);assert.equal(c.attributes['pkce.code.challenge.method'],'S256')}});
test('all requested seed usernames exist with individual accounts',()=>{
 const expected=['head.ganpat','admin.priya','admin.rahul','mfa.admin','leader.ict','leader.ec','leader.me','manager.hr','emp.it1','emp.fin1','fac.ict1','fac.ec1','stu.ict1','stu.ict2','stu.ec1','stu.me1','ro.audit','mfa.test'];
 assert.deepEqual(realm.users.map(u=>u.username).sort(),expected.sort());
});
test('privileged roles inherit mfa-required and are prompted to enroll',()=>{
 for(const name of ['org-head','iam-admin','dept-leader']) assert.ok(realm.roles.realm.find(r=>r.name===name).composites.realm.includes('mfa-required'));
 for(const u of realm.users.filter(u=>u.realmRoles.some(r=>['org-head','iam-admin','dept-leader'].includes(r)) || u.username==='mfa.test')) assert.ok(u.requiredActions.includes('CONFIGURE_TOTP'),u.username);
});
test('all user passwords are environment placeholders rather than committed credentials',()=>{
 for(const u of realm.users) assert.equal(u.credentials.find(c=>c.type==='password').value,'${DEMO_USER_PASSWORD}');
});
