// 사이드 패널: 공정 카드를 누르면 오른쪽에서 나온다
// 요약 → 상태 변경(클릭) → 복구 예정 입력 → 상세 화면 바로가기
const UST = { run: ['운전', '#2E9E6A'], standby: ['대기', '#6B7685'], fail: ['고장', '#D93F3F'], pm: ['정비', '#E59A0B'] };

// AI 수리시간 추정: 같은 설비 역할의 과거 수리 기록(가상)에서 중앙값과 범위
const REPAIR_HIST = {
  '원료 펌프': { n: 31, med: 5,   lo: 3, hi: 8 },
  '순환 펌프': { n: 27, med: 6,   lo: 4, hi: 9 },
  '환류 펌프': { n: 23, med: 4.5, lo: 3, hi: 7 },
  '열교환기':  { n: 12, med: 9,   lo: 6, hi: 14 },
  '이송 펌프': { n: 35, med: 3.5, lo: 2, hi: 5 },
};
const PM_HOURS = 6; // 계획정비는 계획된 시간

// 현장 실측값(가상): 현장직원이 측정 가능한 저가 계기 기준 — 역할별 정상 범위
// [최소, 최대, 단위, 소수자리]
const FIELD_RANGE = {
  '원료 펌프': { '압력': [4.0, 6.0, 'bar', 1], '온도': [35, 45, '℃', 0], '진동': [1.2, 2.2, 'mm/s', 1], '전류': [16, 22, 'A', 1] },
  '순환 펌프': { '압력': [4.5, 6.5, 'bar', 1], '온도': [38, 48, '℃', 0], '진동': [1.3, 2.3, 'mm/s', 1], '전류': [18, 24, 'A', 1] },
  '환류 펌프': { '압력': [3.5, 5.5, 'bar', 1], '온도': [33, 43, '℃', 0], '진동': [1.1, 2.0, 'mm/s', 1], '전류': [14, 20, 'A', 1] },
  '이송 펌프': { '압력': [3.0, 5.0, 'bar', 1], '온도': [30, 40, '℃', 0], '진동': [1.0, 1.8, 'mm/s', 1], '전류': [12, 18, 'A', 1] },
  '열교환기':  { '압력': [3.0, 5.0, 'bar', 1], '온도': [55, 70, '℃', 0], '차압': [0.3, 0.6, 'bar', 2] },
};
// 설비별 고정 시드 — 매 렌더마다 값이 흔들리지 않도록
const FIELD_SEED = {};
(() => { let seed = 29; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const u of PLANT) for (const r of u.roles) for (const x of r.units) FIELD_SEED[x.id] = rnd();
})();
// 정상 가동 중이면 정상범위 안, 고장(fail)이면 정상범위를 벗어난 값
function fieldReading(r, x) {
  const ranges = FIELD_RANGE[r.name], s = FIELD_SEED[x.id], abnormal = x.st === 'fail';
  return Object.entries(ranges).map(([label, [lo, hi, unit, dec]]) => {
    const v = abnormal ? hi + (hi - lo) * (0.3 + s * 0.7) : lo + (hi - lo) * s;
    return { label, v: v.toFixed(dec), unit, bad: abnormal };
  });
}
function fieldReadingRow(r) {
  const x = r.units.find(y => y.st === 'run') || r.units.find(y => y.st === 'fail') || r.units[0];
  if (x.st === 'pm') return `<div class="fr"><b>${x.id}</b><span>${r.name}</span><i>점검 중 — 측정값 없음</i></div>`;
  return `<div class="fr ${x.st === 'fail' ? 'bad' : ''}"><b>${x.id}</b><span>${r.name}</span>` +
    fieldReading(r, x).map(v => `<i class="${v.bad ? 'bad' : ''}">${v.label} ${v.v}${v.unit}</i>`).join('') + '</div>';
}

let openId = null;

function aiEta(r, x) {
  if (x.st === 'pm') return { txt: `계획정비 ${PM_HOURS}시간`, h: PM_HOURS };
  const h = REPAIR_HIST[r.name];
  return { txt: `AI 추정 약 ${h.med}시간 <small>(과거 ${r.name} 고장 ${h.n}건 · ${h.lo}~${h.hi}시간)</small>`, h: h.med };
}

function drawerHTML(u) {
  const { st, rate } = unitState(u);
  const off = u.roles.flatMap(r => r.units.filter(x => x.st === 'fail' || x.st === 'pm').map(x => ({ r, x })));
  const longest = off.reduce((a, o) => Math.max(a, aiEta(o.r, o.x).h), 0);
  const offHTML = off.length ? off.map(({ r, x }) => {
    const other = r.units.find(y => y !== x);
    return `<div class="off"><b style="color:${UST[x.st][1]}">${x.id} ${UST[x.st][0]}</b>
      <span>${r.name} · ${other.st === 'run' ? `${other.id}(Stand-by) 운전 중` : `<em>${other.id}도 ${UST[other.st][0]} → 감산</em>`}</span>
      <span class="ai">${aiEta(r, x).txt}</span></div>`; }).join('')
    : '<div class="off none">서 있는 설비 없음 — 모든 역할이 Main 운전, Stand-by 대기</div>';

  const rows = u.roles.map(r => `<tr><td><b>${STAGES[r.stage]}</b><small>${r.name}</small></td>` +
    r.units.map(x => `<td><div class="eq">${x.id}<i>${x === r.units[0] ? 'Main' : 'Stand-by'}</i></div><div class="sb">` +
      Object.keys(UST).map(k => `<button class="${x.st === k ? 'on' : ''}" style="--k:${UST[k][1]}" data-eq="${x.id}" data-st="${k}">${UST[k][0]}</button>`).join('') +
      '</div></td>').join('') + '</tr>').join('');

  return `<div class="dh" style="--c:${ST[st].c}"><div><span class="no">${u.id}</span> ${u.name}</div><span class="chip">${ST[st].t}</span><button id="dx">✕</button></div>
  <h4>현장 실측값 <small>현장직원 입력 기준 · 역할별 Main(또는 운전 중인 호기)</small></h4>
  <div class="freadings">${u.roles.map(fieldReadingRow).join('')}</div>
  <div class="dk">
    <div><span>생산율</span><b>${Math.round(rate * 100)}%</b></div>
    <div><span>오늘 손실</span><b>${u.loss.toFixed(1)} t</b></div>
    <div><span>Stand-by로 버틴 시간</span><b>${(u.thinMin / 60).toFixed(1)} h</b></div>
  </div>
  <h4>지금 서 있는 설비</h4>${offHTML}
  <h4>복구 예정 <small>담당자 입력</small></h4>
  <div class="eta"><input id="etaIn" placeholder="14:00" maxlength="5" size="5" value="${u.eta || ''}" ${off.length ? '' : 'disabled'}>
    <button id="etaSave" ${off.length ? '' : 'disabled'}>저장</button>
    ${off.length ? `<button id="etaAi" class="g">AI 추정 적용 (${hhmm(SIM.min + longest * 60)})</button>` : ''}
    <span>${u.eta ? `현재 입력: <b>${u.eta}</b>` : off.length ? '<em>아직 입력 없음</em>' : ''}</span></div>
  <h4>라인 상태 변경 <small>누르면 바로 반영</small></h4>
  <table class="lines"><tr><th>단계</th><th>Main</th><th>Stand-by</th></tr>${rows}</table>
  <div class="dl"><button data-go="flow">라인 흐름도</button><button data-go="prod">생산 손실 상세</button><button data-go="alt">대안 보기</button></div>`;
}

function openDrawer(id) { openId = id; drawer.dataset.h = ''; renderDrawer(); document.body.classList.add('dopen'); }
function closeDrawer() { openId = null; document.body.classList.remove('dopen'); }

function renderDrawer() {
  if (!openId) return;
  const u = unit(openId);
  // 입력 중에는 다시 그리지 않는다 (손실 숫자만 갱신)
  if (document.activeElement && document.activeElement.id === 'etaIn') return;
  const h = drawerHTML(u);
  if (drawer.dataset.h !== h) { drawer.innerHTML = h; drawer.dataset.h = h; }
}

const drawer = document.getElementById('drawer');
document.getElementById('cards').addEventListener('click', e => { const c = e.target.closest('.rc'); if (c) openDrawer(c.dataset.u); });
document.getElementById('scrim').onclick = closeDrawer;
drawer.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const u = unit(openId);
  if (b.id === 'dx') return closeDrawer();
  if (b.dataset.eq) {
    setSt(openId, b.dataset.eq, b.dataset.st);
    if (unitState(u).st === 'ok') u.eta = null;
    SIM.log.unshift({ m: SIM.min, uid: openId, txt: `${b.dataset.eq} → ${UST[b.dataset.st][0]} (담당자 변경)` });
    flash(openId);
  }
  if (b.id === 'etaSave') { const v = document.getElementById('etaIn').value.trim(); if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) { u.eta = v; SIM.log.unshift({ m: SIM.min, uid: openId, txt: `복구 예정 ${v} 입력 (담당자)` }); } }
  if (b.id === 'etaAi') { u.eta = b.textContent.match(/\d\d:\d\d/)[0]; SIM.log.unshift({ m: SIM.min, uid: openId, txt: `복구 예정 ${u.eta} (AI 추정 적용)` }); }
  if (b.dataset.go === 'flow') return showView('flow', openId);
  if (b.dataset.go === 'prod') { closeDrawer(); showView('prod'); return openTrend(openId); }
  if (b.dataset.go === 'alt') { const i = DEC.shown ? DEC.list.findIndex(d => d.p.uid === openId) : -1;
    if (i >= 0) { closeDrawer(); return openAlt(i); } b.textContent = '판단이 필요한 건 없음'; return; }
  document.activeElement.blur(); drawer.dataset.h = ''; render();
});
