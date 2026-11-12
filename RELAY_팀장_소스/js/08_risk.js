// 손실 예상 + 판단이 필요한 건 + 대안 비교
// 계획정비 일정(확실) + AI 고장 위험(불확실). "판단이 필요한 건" = Stand-by까지 위험해지는 경우만
// AI는 추천하지 않는다. 대안을 나란히 비교만 한다
const TODAY = new Date(2026, 9, 14);
const dstr = d => `${d.getMonth() + 1}/${d.getDate()}`;
const addD = n => new Date(TODAY.getTime() + n * 864e5);

// AI 고장 위험 (향후 30일 고장 확률, 가상). 대부분 낮고 몇 개만 높다
const RISK = {};
(() => { let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const u of PLANT) for (const r of u.roles) for (const x of r.units) RISK[x.id] = +(0.02 + rnd() * 0.12).toFixed(2);
  Object.assign(RISK, { 'P542-2': 0.38, 'P231-1': 0.27, 'E661-2': 0.22, 'P712-1': 0.21 });
})();

// 계획정비 일정 [공정, 설비, 며칠 뒤, 시간, 두 줄 모두 서는가]
const PMS = [
  ['U100', 'P112-1', 3, 6], ['U300', 'P342-1', 4, 8], ['U500', 'P542-1', 7, 12], ['U700', 'P782-2', 9, 6],
  ['U200', 'E261-1', 14, 24, true], ['U800', 'P831-1', 16, 6], ['U400', 'P412-2', 19, 8], ['U600', 'E661-1', 23, 10], ['U300', 'P382-1', 27, 6],
].map(([uid, eq, d, h, both]) => { const u = unit(uid), r = u.roles.find(r => eq.startsWith(r.tag));
  return { uid, eq, day: d, h, both: !!both, r, mate: r.units.find(x => x.id !== eq).id, rate: (u.cap * (1 - r.down)) / 24 }; });

// 판단이 필요한 건: 정비하는 동안 받아줄 Stand-by의 고장 위험이 높음 (시나리오 10:30에 AI 갱신으로 나타남)
const DEC = { shown: false, list: [] };
function buildDecisions() {
  DEC.list = PMS.filter(p => !p.both && RISK[p.mate] >= 0.25).map(p => {
    const worst = p.rate * p.h, pr = RISK[p.mate];
    return { p, pr, alts: [
      { t: '예정대로 정비', when: dstr(addD(p.day)), loss: `0 ~ ${fmt(worst)} t`, exp: pr * worst, hold: p.h, note: `${p.mate} 고장 시 감산 (AI 위험 ${Math.round(pr * 100)}%)` },
      { t: `${p.mate} 먼저 점검 후 정비`, when: dstr(addD(p.day + 1)), loss: '0 t', exp: 0, hold: 4, note: '정비 일정 하루 밀림 · 점검 4시간 추가' },
      { t: '감산 운전 중 정비', when: dstr(addD(p.day)), loss: `${fmt(worst)} t (확정)`, exp: worst, hold: 0, note: '손실은 확정, 정지 위험 없음' },
    ] };
  });
}
buildDecisions();

function renderTodo() {
  const el = document.getElementById('todo');
  const h = !DEC.shown ? '<div class="empty">지금은 판단이 필요한 건이 없습니다.<small>Stand-by까지 위험해지는 경우에만 여기에 뜹니다.</small></div>'
    : DEC.list.map((d, i) => `<div class="dec" data-alt="${i}"><div class="n">${i + 1}</div><div><b>${d.p.uid} · ${d.p.eq} 정비 예정 ${dstr(addD(d.p.day))}</b>
      <span>정비 중 받아줄 <em>${d.p.mate}</em> 고장 위험 <em>${Math.round(d.pr * 100)}%</em> (AI) → 정비 중 감산 가능</span></div><button>대안 보기</button></div>`).join('');
  if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}

function openAlt(i) {
  const d = DEC.list[i], u = unit(d.p.uid);
  const maxE = Math.max(...d.alts.map(a => a.exp), 1);
  document.getElementById('alt').innerHTML = `<div class="ab">
    <div class="ah"><div><small>판단이 필요한 건</small><b>${u.id} ${u.name} · ${d.p.eq} ${d.p.r.name} 정비 (${dstr(addD(d.p.day))}, ${d.p.h}시간)</b></div><button id="ax">✕</button></div>
    <p class="aw">정비하는 동안 받아줄 <b>${d.p.mate}</b>의 AI 고장 위험이 <b>${Math.round(d.pr * 100)}%</b>입니다. ${d.p.mate}까지 서면 생산이 ${Math.round(d.p.r.down * 100)}%로 떨어집니다.</p>
    <div class="ag">${d.alts.map((a, k) => `<div class="ac"><div class="an">${'①②③'[k]}</div><h4>${a.t}</h4>
      <dl><dt>정비일</dt><dd>${a.when}</dd><dt>예상 손실</dt><dd><b>${a.loss}</b></dd>
      <dt>기대 손실</dt><dd><span class="eb"><i style="width:${a.exp / maxE * 100}%"></i></span>${fmt(a.exp)} t</dd>
      <dt>Stand-by로 버티는 시간</dt><dd><b>${a.hold}시간</b></dd></dl><p>${a.note}</p></div>`).join('')}</div>
    <div class="af">AI는 고르지 않습니다. 비교만 합니다. <span>기대 손실 = 손실 × AI 고장 위험</span></div></div>`;
  document.body.classList.add('aopen');
}
const closeAlt = () => document.body.classList.remove('aopen');

// 손실 예상 화면: 1주·1개월, 공정별 일정 막대
let RV = 30;
function renderRisk() {
  const v = document.getElementById('riskView'); if (!v || v.hidden || v.dataset.built == RV + '' + DEC.shown) return;
  v.dataset.built = RV + '' + DEC.shown;
  const pms = PMS.filter(p => p.day <= RV);
  const sure = sum(pms.filter(p => p.both), p => p.rate * p.h);
  const riskLoss = sum(PLANT.flatMap(u => u.roles.map(r => ({ u, r }))), ({ u, r }) =>
    RISK[r.units[0].id] * RISK[r.units[1].id] * 4 * (u.cap * (1 - r.down) / 24) * REPAIR_HIST[r.name].med) * RV / 30
    + sum(pms.filter(p => !p.both), p => RISK[p.mate] * p.rate * p.h);
  const plan = PLANT.reduce((a, u) => a + u.plan, 0) * RV;
  const W = 1160, cell = W / RV;
  const rows = PLANT.map(u => {
    const bars = pms.filter(p => p.uid === u.id).map(p => { const dec = DEC.shown && DEC.list.some(d => d.p === p);
      return `<div class="gb ${p.both ? 'sure' : dec ? 'dec' : ''}" style="left:${(p.day - 0.5) * cell}px;width:${Math.max(cell * p.h / 24, 14)}px" title="${p.eq}"><span>${p.eq} ${p.both ? '공정 정지' : '정비'} ${p.h}h${dec ? ' ⚠' : ''}</span></div>`; }).join('');
    const hot = u.roles.flatMap(r => r.units).filter(x => RISK[x.id] >= 0.2).map(x => `<span class="hot">${x.id} 고장 위험 ${Math.round(RISK[x.id] * 100)}%</span>`).join('');
    return `<div class="gr"><div class="gl"><b>${u.id}</b> ${u.name}</div><div class="gt" style="width:${W}px">${bars}</div><div class="gh">${hot}</div></div>`;
  }).join('');
  const days = Array.from({ length: RV }, (_, i) => `<span style="left:${i * cell}px;width:${cell}px">${RV <= 7 || i % 3 === 0 ? dstr(addD(i + 1)) : ''}</span>`).join('');
  v.innerHTML = `<div class="pbar"><button data-rv="7" class="${RV === 7 ? 'on' : ''}">1주</button><button data-rv="30" class="${RV === 30 ? 'on' : ''}">1개월</button><span>${dstr(addD(1))} ~ ${dstr(addD(RV))}</span></div>
  <div class="pk">
    <div class="red"><span>확실한 손실 (계획정비)</span><b>${fmt(sure)} t</b><small>두 줄 모두 세우는 정비</small></div>
    <div class="amb"><span>고장 위험 기대 손실 (AI)</span><b>${fmt(riskLoss)} t</b><small>불확실 · 고장 확률 × 손실</small></div>
    <div><span>계획 달성 전망</span><b>${((plan - sure - riskLoss) / plan * 100).toFixed(1)}%</b><small>계획 ${fmt(plan)} t</small></div>
    <div class="${DEC.shown && DEC.list.length ? 'red' : ''}" data-go1="1" style="cursor:pointer"><span>판단이 필요한 건</span><b>${DEC.shown ? DEC.list.length : 0}건</b><small>Stand-by까지 위험해지는 경우만</small></div>
  </div>
  <section class="card" style="flex:1"><h3>공정별 정비 일정과 고장 위험 <small>빨강 = 공정 정지 · 주황 = 판단 필요</small></h3>
    <div class="gw"><div class="gr gd"><div class="gl"></div><div class="gt days" style="width:${W}px">${days}</div><div class="gh"></div></div>${rows}</div></section>`;
}

document.getElementById('todo').addEventListener('click', e => { const d = e.target.closest('[data-alt]'); if (d) openAlt(+d.dataset.alt); });
document.getElementById('alt').addEventListener('click', e => { if (e.target.id === 'ax' || e.target.id === 'alt') closeAlt(); });
document.getElementById('riskView').addEventListener('click', e => {
  const b = e.target.closest('[data-rv]'); if (b) { RV = +b.dataset.rv; renderRisk(); }
  if (e.target.closest('[data-go1]') && DEC.shown && DEC.list.length) openAlt(0);
  const g = e.target.closest('.gb.dec'); if (g) openAlt(0);
});
