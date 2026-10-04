import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { listenerCandidates, probeInference } from '../lib/discovery.mjs';
import { InferenceCollector, loadingProgress, normalizeLlamaMetrics, parsePrometheus, metricTotal, metricsEngine } from '../lib/collectors.mjs';

test('active inference CLI admits custom ports, excludes RPC and dashboard', () => {
  const listeners = ['LISTEN 0 512 192.0.2.10:18889 0.0.0.0:*', 'LISTEN 0 512 0.0.0.0:31524 0.0.0.0:*', 'LISTEN 0 512 0.0.0.0:8787 0.0.0.0:*'].join('\n');
  const processes = '/llama/llama-server --port 18889\n/llama/ggml-rpc-server --port 31524';
  assert.deepEqual(listenerCandidates(listeners, processes, 8787).map(x => x.port), [18889]);
});

test('multiple live APIs are separate tabs and 503 loading survives missing metrics', async () => {
  async function start(loading) {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/metrics') { res.statusCode=404;res.end('{}');return; }
      if (loading) { res.statusCode=503;res.end(JSON.stringify({error:{message:'Loading model'}}));return; }
      res.end(JSON.stringify(req.url === '/v1/models' ? {data:[{id:'test-model'}]} : {status:'ok'}));
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    return server;
  }
  const a=await start(true),b=await start(false);
  try {
    const candidates=[a,b].map(server=>({port:server.address().port,api:`http://127.0.0.1:${server.address().port}`,engine:'llama.cpp'}));
    const found=await Promise.all(candidates.map(probeInference));
    assert.equal(new Set(found.map(x=>x.id)).size,2);
    assert.equal(found[0].loading,true);
    const loading=await new InferenceCollector(candidates[0].api).collect();
    assert.equal(loading.ok,false);assert.equal(loading.loading,true);assert.equal(loading.apiReachable,true);
    const ready=await new InferenceCollector(candidates[1].api).collect();
    assert.equal(ready.ok,true);assert.equal(ready.metricsAvailable,false);assert.equal(ready.modelName,'test-model');
    assert.equal(ready.outputTokensPerSecond,undefined);
  } finally { a.closeAllConnections();b.closeAllConnections();await Promise.all([a,b].map(server=>new Promise(resolve=>server.close(resolve)))); }
});

test('loading percentages require an explicit valid engine fraction', () => {
  assert.equal(loadingProgress({progress:{value:0.375,current:'text_model'}}).loadingPercent,37.5);
  assert.equal(loadingProgress({loading_progress:1}).loadingPercent,100);
  for(const raw of [-1,101,Infinity,'50',null]) assert.equal(loadingProgress({progress:raw}).loadingPercent,null);
  assert.equal(loadingProgress({}).loadingPercent,null);
});

test('llama native counters preserve token accounting without invented metrics', () => {
  const metrics=parsePrometheus('llamacpp:prompt_tokens_total 100\nllamacpp:prompt_tokens_cached_total 50\nllamacpp:tokens_predicted_total 20\nllamacpp:requests_processing 2\nllamacpp:requests_deferred 1\n');
  assert.equal(metricsEngine(metrics),'llama.cpp');normalizeLlamaMetrics(metrics);
  assert.equal(metricTotal(metrics,'vllm:prompt_tokens_total'),150);
  assert.equal(metricTotal(metrics,'vllm:prompt_tokens_by_source_total',{source:'local_compute'}),100);
  assert.equal(metricTotal(metrics,'vllm:generation_tokens_total'),20);
  assert.equal(metricTotal(metrics,'vllm:num_requests_running'),2);
  assert.equal(metricTotal(metrics,'vllm:request_success_total'),null);
});
