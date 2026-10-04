import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export function listenerCandidates(listeners, processes, excludedPort) {
  const hints = new Map();
  for (const line of processes.split('\n')) {
    if (/ggml-rpc-server|rpc-server/.test(line)) continue;
    const engine = /llama-server/.test(line) ? 'llama.cpp'
      : /vllm.*(?:serve|api_server)/i.test(line) ? 'vLLM'
      : /tensorfold.*serve|flash15_tf_launch.*serve|tf_launch.*serve/i.test(line) ? 'TensorFold'
      : /sglang.*launch_server/.test(line) ? 'SGLang' : /ollama.*serve/.test(line) ? 'Ollama' : null;
    if (!engine) continue;
    const port = Number(line.match(/(?:--port|--listen-port)(?:=|\s+)(\d+)/)?.[1] ?? (engine === 'Ollama' ? 11434 : 0));
    if (port) hints.set(port, { engine, model: line.match(/(?:--alias|--served-model-name|--name)(?:=|\s+)([^\s]+)/)?.[1]?.replace(/[\"']/g, '') ?? null });
  }
  const common = new Set([1234, 5000, 5001, 8000, 8001, 8080, 8081, 8888, 8889, 9000, 11434]);
  const byPort = new Map();
  for (const line of listeners.split('\n')) {
    const local = line.trim().split(/\s+/)[3];
    const match = local?.match(/^(.*):(\d+)$/);
    if (!match) continue;
    const port = Number(match[2]);
    // Process hints admit custom HTTP ports without probing RPC/NCCL sockets.
    if (port === excludedPort || (!hints.has(port) && !common.has(port))) continue;
    let host = match[1].replace(/^\[|\]$/g, '');
    if (host === '*' || host === '0.0.0.0') host = '127.0.0.1';
    if (host === '::') host = '::1';
    if (!/^[\da-fA-F:.]+$/.test(host)) continue;
    const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
    if (!byPort.has(port)) byPort.set(port, { port, api: url, engine: hints.get(port)?.engine ?? null, model: hints.get(port)?.model ?? null });
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port).slice(0, 32);
}

export async function probeInference(candidate) {
  async function get(route) {
    try {
      const response = await fetch(candidate.api + route, { signal: AbortSignal.timeout(1500), redirect: 'error' });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    } catch { return null; }
  }
  const [health, models] = await Promise.all([get('/health'), get('/v1/models')]);
  const loading = health?.status === 503 && /loading/i.test(health.body?.error?.message ?? health.body?.status ?? '');
  const model = models?.status === 200 && Array.isArray(models.body?.data)
    ? models.body.data.find((item) => typeof item?.id === 'string')?.id : null;
  if (!model && !loading) return null;
  const shown = model ? model.split('/').filter(Boolean).at(-1) : candidate.model ?? candidate.engine ?? 'Model';
  return { ...candidate, id: `port-${candidate.port}`, name: `${shown} | :${candidate.port}`, loading };
}

export async function discoverInferenceApis(excludedPort) {
  const [listeners, processes] = await Promise.all([
    exec('ss', ['-H', '-ltn'], { timeout: 2500, maxBuffer: 1024 * 1024 }),
    exec('ps', ['-eo', 'args'], { timeout: 2500, maxBuffer: 4 * 1024 * 1024 }),
  ]);
  const candidates = listenerCandidates(listeners.stdout, processes.stdout, excludedPort);
  const found = [];
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = await Promise.all(candidates.slice(i, i + 4).map(probeInference));
    found.push(...batch.filter(Boolean));
  }
  return found;
}
