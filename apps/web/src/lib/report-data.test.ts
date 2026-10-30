import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthPeriod } from '@storecare/reports';
import { loadMonthData } from './report-data.ts';

test('an unavailable monitoring query cannot become a report with missing data',async()=>{
  function query(table: string) {
    const chain = {
      select(){return chain;},eq(){return chain;},gte(){return chain;},lt(){return chain;},order(){return chain;},limit(){return chain;},not(){return chain;},single(){return chain;},
      then(resolve: (result:unknown)=>unknown) {
        return Promise.resolve(resolve(table==='stores'
          ? {data:{id:'store',agency_id:'agency'},error:null}
          : table==='work_entries' ? {data:null,error:{code:'XX000',message:'read failed'}} : {data:[],error:null}));
      },
    };return chain;
  }
  const client={from:query,rpc:()=>Promise.resolve({data:[],error:null})} as unknown as Parameters<typeof loadMonthData>[0];
  await assert.rejects(loadMonthData(client,'store',monthPeriod('2026-10')),/temporarily unavailable/);
});
