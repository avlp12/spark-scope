import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosisStatus, snapshotAge } from '../public/diagnostics/model.js';
test('incomplete collection cannot become clean and retains serious findings',()=>{
 assert.equal(diagnosisStatus({exitCode:3,findings:[]}).kind,'incomplete');
 const s=diagnosisStatus({incomplete:true,findings:[{severity:'critical'}]});assert.equal(s.kind,'incomplete');assert.match(s.text,/심각 1/);
});
test('severity is derived from findings and clean wording stays scoped',()=>{
 assert.equal(diagnosisStatus({findings:[{severity:'critical'}]}).kind,'critical');
 assert.equal(diagnosisStatus({findings:[{severity:'warning'}]}).kind,'warning');
 assert.match(diagnosisStatus({findings:[]}).text,/수집된 항목/);
});
test('stale and invalid timestamps are not represented as live',()=>{
 const now=Date.parse('2026-10-05T00:00:00Z');
 assert.match(snapshotAge('2026-10-04T22:00:00Z',now),/현재 상태와 다를/);
 assert.match(snapshotAge('bad',now),/확인 필요/);
 assert.match(snapshotAge('2026-10-06T00:00:00Z',now),/확인 필요/);
});

test("optional log denial stays visible even when upstream exit code is zero",()=>{
 const s=diagnosisStatus({exitCode:0,incomplete:false,findings:[],collectors:[{name:"logs",ok:false,optional:true,errors:["permission denied"]}]});
 assert.equal(s.kind,"incomplete");assert.match(s.text,/일부 수집 제한/);
});
