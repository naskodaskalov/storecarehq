import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueHealthCheck } from './health-check-request.ts';
const id = '11111111-1111-4111-8111-111111111111';
function fake(user: boolean, response = {data:id,error:null} as {data:string|null;error:{message:string}|null}, reject = false) {
  const calls:unknown[]=[];
  const client={auth:{getUser:async()=>({data:{user:user?{id:'owner'}:null}})},rpc:async(...args:unknown[])=>{
    calls.push(args);if(reject)throw new Error('private provider key');return response;
  }} as unknown as Parameters<typeof queueHealthCheck>[0];
  return {client,calls};
}
test('health check requests require a valid store and signed-in user',async()=>{
  const {client,calls}=fake(false);
  assert.equal((await queueHealthCheck(client,id)).error,'Sign in to request a health check.');
  assert.equal((await queueHealthCheck(client,'bad-id')).error,'Store unavailable.');assert.equal(calls.length,0);
});
test('health check requests use the scoped RPC and return its existing request ID',async()=>{
  const {client,calls}=fake(true);assert.deepEqual(await queueHealthCheck(client,id),{error:null,requestId:id});
  assert.deepEqual(calls,[['request_health_check',{p_store:id}]]);
});
test('cooldown feedback is useful but unexpected provider errors stay private',async()=>{
  const known=fake(true,{data:null,error:{message:'Please wait five minutes between health checks.'}});
  assert.match((await queueHealthCheck(known.client,id)).error!,/five minutes/);
  const unknown=fake(true,{data:null,error:{message:'private provider key'}});
  const rejected=fake(true,undefined,true);
  for(const f of [unknown,rejected])assert.deepEqual(await queueHealthCheck(f.client,id),{error:'Could not queue a health check. Please try again.',requestId:null});
});
