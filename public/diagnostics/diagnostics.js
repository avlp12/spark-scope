import { diagnosisStatus, snapshotAge } from './model.js';
const make = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const titles = { 'power.low_draw_under_load':'전력 / 클럭 상태', 'memory.uma_pressure':'통합 메모리 압력', 'memory.oom_killer':'커널 / 컨테이너 OOM 기록', 'gpu.xid_error':'NVIDIA Xid 오류', 'thermal.shutdown_risk':'온도 경고', 'runtime.docker_unhealthy':'Docker GPU 환경', 'backend.multiple_heavy_models':'중복 모델 프로세스', 'cuda.torch_cpu_only':'선택한 Python의 CPU 전용 PyTorch' };
async function refresh() {
 try {
  const response = await fetch('./latest.json', {cache:'no-store'}); if (!response.ok) throw Error();
  const data = await response.json(); if (data.schema !== 'spark-scope.diagnostics.v1' || !Array.isArray(data.nodes)) throw Error();
  document.querySelector('#stamp').textContent = `${snapshotAge(data.createdAt)} | ${new Date(data.createdAt).toLocaleString('ko-KR')} | ${data.phase}`;
  const rows = data.nodes.map(node => {
   const card=make('article',undefined,'report'), status=diagnosisStatus(node);
   card.append(make('h2',node.name),make('span',status.text,'badge '+status.kind));
   card.append(make('p',node.scope==='host_and_running_container'?'호스트 + 실행 중 컨테이너 Python 검사':'호스트 검사 | 컨테이너 CUDA 미확인','muted'));
   card.append(make('p',`Spark Doctor ${node.version??'버전 미확인'} | ${node.createdAt?new Date(node.createdAt).toLocaleString('ko-KR'):'검사 시각 없음'}`,'muted'));
   const list=make('ul'); for(const f of node.findings??[]) {
    const item=make('li');item.append(make('strong',titles[f.rule_id]??f.title),make('div',`${f.severity} | ${f.confidence}`,'muted'));
    const detail=make('details');detail.append(make('summary','근거 보기'),make('p',f.explanation),make('pre',(f.evidence??[]).join('\n')));item.append(detail);list.append(item);
   } card.append(list);
   const gaps=(node.collectors??[]).filter(c=>!c.ok || c.errors?.length);if(gaps.length){const detail=make('details');detail.append(make('summary',`수집 제한 ${gaps.length}개`));for(const c of gaps)detail.append(make('p',`${c.name}${c.optional?' (선택 항목)':''}: ${(c.errors??[]).join(' / ')||'수집 불가'}`));card.append(detail);}
   if(node.error)card.append(make('p','스캔 실행 결과를 확인하지 못했습니다.','incomplete'));
   return card;
  });document.querySelector('#reports').replaceChildren(...rows);
 } catch {document.querySelector('#stamp').textContent='진단 보고서를 불러오지 못했습니다. 기존 표시는 이전 스냅샷일 수 있습니다.';}
}
refresh();setInterval(refresh,30000);
