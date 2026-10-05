export function diagnosisStatus(node) {
  const findings = node.findings ?? [];
  const critical = findings.filter(f => f.severity === "critical").length;
  const warning = findings.filter(f => f.severity === "warning").length;
  if (node.error || node.incomplete || node.exitCode === 3) return { kind: "incomplete", text: `수집 미완료 | 심각 ${critical} | 경고 ${warning}` };
  const gaps = (node.collectors ?? []).filter(c => !c.ok || c.errors?.length).length;
  if (gaps) return { kind: "incomplete", text: `일부 수집 제한 ${gaps} | 심각 ${critical} | 경고 ${warning}` };
  if (critical) return { kind: "critical", text: `심각 ${critical} | 경고 ${warning}` };
  if (warning) return { kind: "warning", text: `경고 ${warning}` };
  return { kind: "clean", text: "수집된 항목에서 경고 없음" };
}
export function snapshotAge(createdAt, now = Date.now()) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t) || t > now + 60000) return "검사 시각 확인 필요";
  const minutes = Math.max(0, Math.floor((now - t) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 전 스냅샷 | 현재 상태와 다를 수 있음` : `${minutes}분 전 스냅샷`;
}
