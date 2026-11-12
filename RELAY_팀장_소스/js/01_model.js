// 공장 모델: 공정 → 단계 → 설비 역할 → 호기(-1 Main, -2 Stand-by)
// 공개 자료에 쓰이므로 실제 회사의 공정명·설비번호는 쓰지 않는다 (가상 공장)
const STAGES = ['원료 투입', '반응', '분리', '정제', '제품 이송'];

// 역할 하나 = Main/Stand-by 한 쌍. down = 둘 다 서면 공정 생산율이 몇 %로 떨어지나
function role(stage, tag, name, down) {
  return { stage, tag, name, down, units: [
    { id: tag + '-1', st: 'run' },      // Main
    { id: tag + '-2', st: 'standby' },  // Stand-by
  ] };
}

const PLANT = [
  { id: 'U100', name: '원료 전처리', cap: 420 },
  { id: 'U200', name: '1반응',       cap: 380 },
  { id: 'U300', name: '2반응',       cap: 380 },
  { id: 'U400', name: '분리·증류',   cap: 360 },
  { id: 'U500', name: '정제',        cap: 340 },
  { id: 'U600', name: '용제 회수',   cap: 300 },
  { id: 'U700', name: '제품 출하',   cap: 400 },
  { id: 'U800', name: '유틸리티',    cap: 450 },
].map((u, i) => {
  const n = (i + 1) * 100;
  u.roles = [
    role(0, `P${n + 12}`, '원료 펌프', 0),
    role(1, `P${n + 31}`, '순환 펌프', 0.4),
    role(2, `P${n + 42}`, '환류 펌프', 0.5),
    role(3, `E${n + 61}`, '열교환기', 0.6),
    role(4, `P${n + 82}`, '이송 펌프', 0),
  ];
  u.plan = u.cap;                       // 일 계획량 (t) — 정상 운전 = 계획 100%
  u.eta = null;                         // 복구 예정 (담당자 입력)
  u.loss = 0; u.thinMin = 0;            // 오늘 누적 손실(t), 버틴 시간(분)
  return u;
});

// 역할 상태: ok 정상 / thin 여유 상실(Stand-by로 버팀) / down 둘 다 정지
function roleState(r) {
  const [m, s] = r.units;
  if (m.st === 'run' && s.st === 'standby') return 'ok';
  if (m.st === 'run' || s.st === 'run') return 'thin';
  return 'down';
}

// 공정 상태 = 가장 나쁜 역할, 생산율 = 정지 역할 중 최소
function unitState(u) {
  let st = 'ok', rate = 1;
  for (const r of u.roles) {
    const s = roleState(r);
    if (s === 'down') { st = 'down'; rate = Math.min(rate, r.down); }
    else if (s === 'thin' && st === 'ok') st = 'thin';
  }
  return { st, rate };
}
