import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newerRelease,codeRepository,validUpdateCommit,updateStep} from './core.ts';
test('only stable strictly newer semver releases qualify',()=>{
  assert.ok(newerRelease('v0.2.0','0.1.9'));
  for(const tag of ['v0.1.9','v0.1.8','v0.2.0-beta','v00.2.0','main','v1.0.0; rm -rf'])assert.equal(newerRelease(tag,'0.1.9'),false);
});
test('update target cannot be upstream, another owner, data repo or client repo',()=>{
  assert.equal(codeRepository('coach/app','coach','data'),'coach/app');
  for(const repo of ['gokerlek/axon-fit','someone/app','coach/data','coach/client-test','coach/Client-test','coach/..','coach/.','coach/../data',undefined])assert.throws(()=>codeRepository(repo,'coach','data'));
});
test('stale, merged or unrelated staging commits never replace the production branch',()=>{
  const commit={parents:[{sha:'expected'}],message:'Axon update v0.2.0'};
  assert.ok(validUpdateCommit(commit,'expected','v0.2.0'));
  assert.equal(validUpdateCommit(commit,'newer-head','v0.2.0'),false);
  assert.equal(validUpdateCommit({...commit,parents:[{sha:'expected'},{sha:'other'}]},'expected','v0.2.0'),false);
  assert.equal(validUpdateCommit({...commit,message:'custom code'},'expected','v0.2.0'),false);
});
test('one request per step: a prepared, running or published release never offers another prepare',()=>{
  const run=(over:Partial<{tag:string;status:string;conclusion:string|null;applied:boolean}>={})=>({tag:'v0.2.0',status:'completed',conclusion:'success',applied:false,...over});
  assert.equal(updateStep('v0.2.0',null),'prepare');
  assert.equal(updateStep('v0.2.0',run({status:'queued',conclusion:null})),'preparing');
  assert.equal(updateStep('v0.2.0',run({tag:'v0.1.9',status:'in_progress',conclusion:null})),'preparing');
  assert.equal(updateStep('v0.2.0',run()),'publish');
  assert.equal(updateStep('v0.2.0',run({applied:true})),'published');
  assert.equal(updateStep('v0.2.0',run({conclusion:'failure'})),'prepare');
  assert.equal(updateStep('v0.2.0',run({tag:'v0.1.9',applied:true})),'prepare');
});
