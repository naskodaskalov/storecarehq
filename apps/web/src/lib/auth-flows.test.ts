import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginWithPassword, registerWithPassword, requestRecovery, requestMagicLink, savePassword } from './auth-flows.ts';

type Auth = Parameters<typeof loginWithPassword>[0];
const callback = 'https://storecare.example/auth/callback';
function fake(over: Record<string,unknown> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const methods = Object.fromEntries(['signInWithPassword','signInWithOtp','signUp','resetPasswordForEmail','updateUser'].map(method => [method,async (...args: unknown[]) => {
    calls.push({method,args});return {data:{},error:null};
  }]));
  return { calls, auth: { ...methods, getUser: async () => ({data:{user:{id:'user'}},error:null}), ...over } as unknown as Auth };
}

test('password sign-in preserves whitespace and does not create an account', async () => {
  const {auth,calls}=fake();
  assert.equal(await loginWithPassword(auth,'owner@example.com',' a long password '),null);
  assert.deepEqual(calls,[{method:'signInWithPassword',args:[{email:'owner@example.com',password:' a long password '}]}]);
});
test('signup validates confirmation before sending, then uses the verified callback', async () => {
  const {auth,calls}=fake();
  assert.match((await registerWithPassword(auth,'owner@example.com','long password 123','different',callback))!,/do not match/);
  assert.equal(calls.length,0);
  assert.equal(await registerWithPassword(auth,'owner@example.com','long password 123','long password 123',callback),null);
  assert.deepEqual(calls[0].args,[{email:'owner@example.com',password:'long password 123',options:{emailRedirectTo:callback}}]);
});
test('password validation rejects short passwords without contacting Supabase', async () => {
  const {auth,calls}=fake();
  assert.match((await savePassword(auth,'short','short'))!,/8 and 128/);
  assert.equal(calls.length,0);
});
test('expired sessions cannot update passwords', async () => {
  const {auth,calls}=fake({getUser:async()=>({data:{user:null},error:null})});
  assert.match((await savePassword(auth,'a long password','a long password'))!,/expired/);
  assert.equal(calls.length,0);
});
test('existing authenticated email-link users can set a password', async () => {
  const {auth,calls}=fake();
  assert.equal(await savePassword(auth,'eight123','eight123'),null);
  assert.deepEqual(calls,[{method:'updateUser',args:[{password:'eight123'}]}]);
});
test('reset does not reveal unknown accounts; magic links never create users', async () => {
  const unknown=fake({resetPasswordForEmail:async()=>({error:{code:'user_not_found'}})});
  assert.equal(await requestRecovery(unknown.auth,'unknown@example.com',callback),null);
  const {auth,calls}=fake();
  await requestRecovery(auth,'owner@example.com',callback);
  await requestMagicLink(auth,'owner@example.com',callback);
  assert.deepEqual(calls[0].args,['owner@example.com',{redirectTo:callback}]);
  assert.deepEqual(calls[1].args,[{email:'owner@example.com',options:{emailRedirectTo:callback,shouldCreateUser:false}}]);
});
test('errors provide useful guidance without exposing provider messages', async () => {
  const bad=fake({signInWithPassword:async()=>({error:{code:'invalid_credentials',message:'secret internal detail'}})});
  const message=await loginWithPassword(bad.auth,'owner@example.com','password');
  assert.match(message!,/incorrect/);assert.ok(!message!.includes('secret'));
  const unverified=fake({signInWithPassword:async()=>({error:{code:'email_not_confirmed'}})});
  assert.match((await loginWithPassword(unverified.auth,'owner@example.com','password'))!,/Confirm your email/);
  const limited=fake({resetPasswordForEmail:async()=>({error:{code:'over_email_send_rate_limit'}})});
  assert.match((await requestRecovery(limited.auth,'owner@example.com',callback))!,/Too many attempts/);
});
