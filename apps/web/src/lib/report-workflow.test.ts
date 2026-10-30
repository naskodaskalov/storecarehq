import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SECTIONS } from '@storecare/reports';
import { persistReportEdit, REPORT_CONFLICT } from './report-workflow.ts';

const report = { id:'report-1',status:'draft',updated_at:'2026-10-30T08:00:00Z',summary_text:'Old summary',summary_source:'template' };
function database({ failure = false, concurrent = false } = {}) {
  const state: Record<string,unknown> = {...report};
  const writes: Record<string,unknown>[] = [];
  const client = { from() { return { update(patch: Record<string,unknown>) {
    const predicates: [string,unknown][]=[];
    const query = {
      eq(key: string,value: unknown) { predicates.push([key,value]);return query; },
      select() {return query;},
      async single() {
        if (failure) return {data:null,error:{code:'XX000'}};
        if (concurrent) state.updated_at='2026-10-30T08:01:00Z';
        if (!predicates.every(([key,value])=>state[key]===value)) return {data:null,error:{code:'PGRST116'}};
        writes.push(patch);Object.assign(state,patch);return {data:{id:state.id},error:null};
      },
    };return query;
  } }; } } as unknown as Parameters<typeof persistReportEdit>[0];
  return { client,state,writes };
}
const edit = { summary:'Client-ready summary',sections:DEFAULT_SECTIONS,version:report.updated_at,approver:'owner-1' };

test('approval and final edits are saved in a single write',async()=>{
  const db=database();assert.equal(await persistReportEdit(db.client,report,edit),null);
  assert.equal(db.writes.length,1);
  assert.equal(db.state.status,'approved');assert.equal(db.state.approved_by,'owner-1');
  assert.equal(db.state.summary_text,edit.summary);assert.equal(db.state.summary_source,'edited');
});
test('failed saves never approve the report',async()=>{
  const db=database({failure:true});assert.match((await persistReportEdit(db.client,report,edit))!,/could not be saved/);
  assert.equal(db.writes.length,0);assert.equal(db.state.status,'draft');assert.equal(db.state.summary_text,'Old summary');
});
test('a stale tab cannot overwrite newer edits',async()=>{
  const db=database();assert.equal(await persistReportEdit(db.client,report,{...edit,version:'older'}),REPORT_CONFLICT);
  assert.equal(db.writes.length,0);
});
test('concurrent changes between reading and writing prevent approval',async()=>{
  const db=database({concurrent:true});assert.equal(await persistReportEdit(db.client,report,edit),REPORT_CONFLICT);
  assert.equal(db.writes.length,0);assert.equal(db.state.status,'draft');
});
test('two simultaneous approvals cannot both change the report',async()=>{
  const db=database();const results=await Promise.all([persistReportEdit(db.client,report,edit),persistReportEdit(db.client,report,{...edit,summary:'Other tab'})]);
  assert.equal(results.filter(result=>result===null).length,1);assert.equal(db.writes.length,1);
});
test('save-only keeps a draft private and preserves unchanged summary attribution',async()=>{
  const db=database();assert.equal(await persistReportEdit(db.client,report,{...edit,approver:undefined,summary:'Old summary'}),null);
  assert.equal(db.state.status,'draft');assert.equal(db.state.summary_source,'template');
});
