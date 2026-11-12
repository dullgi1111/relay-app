// 시간 재생 엔진: 가상 시계가 흐르고, 시나리오 사건이 그 시각에 일어난다
// 1초(실제) = SPEED분(가상). 손실·버틴 시간은 매 분 누적
const SIM = { t0: new Date(2026, 9, 14, 8, 0), min: 0, speed: 10, playing: true, loss: 0, thinMin: 0, log: [] };

const unit = id => PLANT.find(u => u.id === id);
const setSt = (uid, eid, st) => { for (const r of unit(uid).roles) for (const x of r.units) if (x.id === eid) x.st = st; };

// [가상 분, 공정, 설명, 동작]
const SCENARIO = [
  [70,  'U400', 'P442-1 고장 → P442-2(Stand-by) 자동 전환', () => { setSt('U400', 'P442-1', 'fail'); setSt('U400', 'P442-2', 'run'); }],
  [100, 'U400', '복구 예정 14:00 입력 (담당자)',            () => { unit('U400').eta = '14:00'; }],
  [210, 'U600', 'P631-1 계획정비 시작 → P631-2 운전',       () => { setSt('U600', 'P631-1', 'pm'); setSt('U600', 'P631-2', 'run'); unit('U600').eta = '17:00'; }],
  [260, 'U600', 'P631-2 고장 → 순환 정지, 생산 40%로',      () => { setSt('U600', 'P631-2', 'fail'); }],
  [150, 'U500', 'AI 예방정비 갱신 → 판단이 필요한 건 1건', () => { DEC.shown = true; }],
  [350, 'U400', 'P442-1 수리 완료 → Main 복귀',            () => { setSt('U400', 'P442-1', 'run'); setSt('U400', 'P442-2', 'standby'); unit('U400').eta = null; }],
  [420, 'U600', 'P631-2 수리 완료 → 생산 회복',            () => { setSt('U600', 'P631-2', 'run'); }],
  [540, 'U600', 'P631-1 정비 완료 → 정상',                 () => { setSt('U600', 'P631-1', 'run'); setSt('U600', 'P631-2', 'standby'); unit('U600').eta = null; }],
];
const END = 600; // 18:00 에서 처음으로 되감기 (무한 반복)

function reset() {
  for (const u of PLANT) { u.eta = null; u.loss = 0; u.thinMin = 0; for (const r of u.roles) { r.units[0].st = 'run'; r.units[1].st = 'standby'; } }
  DEC.shown = false;
  Object.assign(SIM, { min: 0, loss: 0, thinMin: 0, log: [] });
}

function stepMinute() {
  SIM.min++;
  for (const [m, uid, txt, fn] of SCENARIO) if (m === SIM.min) {
    fn(); SIM.log.unshift({ m, uid, txt }); flash(uid);
  }
  for (const u of PLANT) {
    const { st, rate } = unitState(u);
    const l = u.cap * (1 - rate) / 1440;       // t/일 → t/분
    SIM.loss += l; u.loss += l;
    if (st === 'thin') { SIM.thinMin++; u.thinMin++; }
  }
  if (SIM.min >= END) reset();
}

const hhmm = m => { const d = new Date(SIM.t0.getTime() + m * 60000); return `${d.getHours()}`.padStart(2, '0') + ':' + `${d.getMinutes()}`.padStart(2, '0'); };

function flash(uid) {
  requestAnimationFrame(() => { const el = document.querySelector(`.rc[data-u="${uid}"]`); if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } });
}

let acc = 0, last = performance.now();
function loop(now) {
  if (SIM.playing) { acc += (now - last) / 1000 * SIM.speed; let n = 0; while (acc >= 1) { stepMinute(); acc--; n++; } if (n) render(); }
  last = now; requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
