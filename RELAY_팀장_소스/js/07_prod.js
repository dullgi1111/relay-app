// 생산량 변화: ① 공정을 누르면 설비별 현장 실측값 추세 팝업(가상 시계열) ② 생산 손실 추세(월별)
const PV = { period: 12 };                           // 생산 손실 추세 — 보는 기간
const TR = { uid: null, eq: null, metrics: [] };      // 현장 실측값 추세 팝업 — 고른 설비/지표(복수 가능)
const MCOL = { '압력': '#2F5D8A', '온도': '#D93F3F', '진동': '#E59A0B', '전류': '#2E9E6A', '차압': '#8B5CF6' };
let prodChart = null, trendChart = null;

const fmt = n => Math.round(n).toLocaleString();
const PRICE = 150;   // 제품 t당 만 원 (가정) — 손실을 금액으로 환산해 보여줄 때만 사용
const won = t => (t * PRICE / 10000).toFixed(1) + '억 원';

function periodMonths() { return HIST.months.slice(-PV.period); }

function findEq(eqId) {
  for (const u of PLANT) for (const r of u.roles) for (const x of r.units) if (x.id === eqId) return { u, r, x };
}

// 현장 실측값 가상 시계열 — 최근 30일, 정상범위 안에서 흔들리다가 실제 고장/정비 기록 근처에서 벗어난다
const TREND_DAYS = 30;
const TODAY2 = new Date(2026, 9, 14);
const daysAgo = e => Math.round((TODAY2 - new Date(+e.ym.slice(0, 4), +e.ym.slice(5, 7) - 1, e.day)) / 864e5);

function trendLabels() {
  const out = [];
  for (let d = TREND_DAYS - 1; d >= 0; d--) { const dt = new Date(TODAY2.getTime() - d * 864e5); out.push(`${dt.getMonth() + 1}/${dt.getDate()}`); }
  return out;
}

function fieldTrendSeries(eqId, roleName) {
  const ranges = FIELD_RANGE[roleName];
  let seed = 17; for (let i = 0; i < eqId.length; i++) seed += eqId.charCodeAt(i) * (i + 3);
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const badDays = HIST.ev.filter(e => e.eq === eqId).map(daysAgo).filter(d => d >= 0 && d < TREND_DAYS);
  const out = {};
  Object.entries(ranges).forEach(([label, [lo, hi, unit, dec]]) => {
    const mid = (lo + hi) / 2;
    let v = mid + (rnd() - 0.5) * (hi - lo) * 0.3;
    const series = [];
    for (let d = TREND_DAYS - 1; d >= 0; d--) {
      const bad = badDays.some(bd => Math.abs(bd - d) <= 1);
      const target = bad ? hi + (hi - lo) * 0.45 : mid;
      v += (target - v) * 0.35 + (rnd() - 0.5) * (hi - lo) * 0.06;
      series.push(+v.toFixed(dec));
    }
    out[label] = { series, unit, lo, hi, dec };
  });
  return out;
}

function renderProd() {
  const v = document.getElementById('prodView'); if (!v || v.hidden) return;
  if (v.dataset.built) return;   // 시계와 무관 — 한 번 그리고 클릭 때만 다시
  v.dataset.built = 1;

  const procPick = PLANT.map(p => `<button data-tu="${p.id}" style="--c:#2F5D8A">${p.id}<small>${p.name}</small></button>`).join('');

  const ms = periodMonths(), ev = HIST.ev.filter(e => ms.includes(e.ym));
  const plan = sum(ms, HIST.plan) + PLANT.reduce((a, u) => a + u.plan, 0) * SIM.min / 1440;
  const loss = sum(ev, e => e.loss) + SIM.loss, thin = sum(ev, e => e.thinH) + SIM.thinMin / 60;

  v.innerHTML = `
  <section class="card">
    <h3>현장 실측값 추세 <small>공정을 누르면 설비별 압력·온도·진동·전류 추이 (현장직원 입력 기준, 가상 데이터)</small></h3>
    <div class="fpick">${procPick}</div>
  </section>
  <section class="card">
    <h3>생산 손실 추세 <small>월별</small></h3>
    <div class="pbar">${[[1, '이번 달'], [3, '분기'], [6, '반기'], [12, '1년']].map(([n, t]) =>
      `<button data-pp="${n}" class="${PV.period === n ? 'on' : ''}">${t}</button>`).join('')}<span>${ms[0]} ~ ${ms[ms.length - 1]}</span></div>
    <div class="pk">
      <div><span>계획 대비 실적</span><b>${((plan - loss) / plan * 100).toFixed(1)}%</b><small>계획 ${fmt(plan)} t</small></div>
      <div class="red"><span>생산 손실</span><b>${fmt(loss)} t</b><small>≈ ${won(loss)} (t당 ${PRICE}만 원 가정)</small></div>
      <div class="amb"><span>Stand-by로 버틴 시간</span><b>${fmt(thin)} h</b></div>
      <div><span>설비 정지</span><b>${ev.length}건</b><small>고장 ${ev.filter(e => e.type === 'fail').length} · 정비 ${ev.filter(e => e.type === 'pm').length}</small></div>
    </div>
    <div class="pch" style="height:340px"><canvas id="pc"></canvas></div>
  </section>`;

  // 생산 손실 추세 차트 (월별)
  const loss12 = HIST.months.map(mm => sum(HIST.ev.filter(e => e.ym === mm), e => e.loss));
  const pct = HIST.months.map((mm, i) => +((HIST.plan(mm) - loss12[i]) / HIST.plan(mm) * 100).toFixed(2));
  if (prodChart) prodChart.destroy();
  prodChart = new Chart(document.getElementById('pc'), {
    data: { labels: HIST.months.map(mm => +mm.slice(5) + '월'), datasets: [
      { type: 'bar', label: '생산 손실 (t)', data: loss12, yAxisID: 'y', borderRadius: 6,
        backgroundColor: HIST.months.map(mm => ms.includes(mm) ? '#E8908F' : '#E5E9EF') },
      { type: 'line', label: '계획 대비 실적 (%)', data: pct, yAxisID: 'y2', borderColor: '#2F5D8A', backgroundColor: '#2F5D8A', tension: .3, pointRadius: 4 },
    ] },
    options: { maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { labels: { font: { size: 15, weight: 'bold' } } } },
      scales: { x: { ticks: { font: { size: 15 } } }, y: { title: { display: true, text: 't' }, ticks: { font: { size: 13 } } },
        y2: { position: 'right', max: 100, min: Math.floor(Math.min(...pct) * 2) / 2 - 0.5, grid: { display: false }, title: { display: true, text: '%' } } } },
  });
}

// ── 현장 실측값 추세 팝업 ──
function openTrend(uid, eq) {
  const proc = unit(uid);
  TR.uid = uid; TR.eq = eq || proc.roles[0].units[0].id;
  const { r } = findEq(TR.eq);
  TR.metrics = [Object.keys(FIELD_RANGE[r.name])[0]];
  document.body.classList.add('tropen');
  renderTrendModal();
}
function closeTrend() { document.body.classList.remove('tropen'); }

function renderTrendModal() {
  const proc = unit(TR.uid);
  const { r: tr } = findEq(TR.eq);
  const metrics = Object.keys(FIELD_RANGE[tr.name]);
  TR.metrics = TR.metrics.filter(m => metrics.includes(m));
  if (!TR.metrics.length) TR.metrics = [metrics[0]];

  const eqPick = proc.roles.flatMap(r => r.units.map((x, k) =>
    `<button data-te="${x.id}" class="${x.id === TR.eq ? 'on' : ''}" style="--c:${PC[x.st]}">${x.id}<small>${r.name}·${k ? 'Stand-by' : 'Main'}</small></button>`)).join('');
  const mPick = metrics.map(m => `<button data-tm="${m}" class="${TR.metrics.includes(m) ? 'on' : ''}" style="--k:${MCOL[m]}">${m}</button>`).join('');

  document.getElementById('trendModal').innerHTML = `<div class="ab">
    <div class="ah"><div><small>현장 실측값 추세 · 최근 30일</small><b>${proc.id} ${proc.name}</b></div><button id="trx">✕</button></div>
    <div class="fpick" style="margin-top:14px">${eqPick}</div>
    <p class="note" style="margin:12px 0 0">지표는 한 개만 볼 수도, 여러 개를 겹쳐 볼 수도 있습니다 (단위가 달라 정상범위 대비 %로 환산해 보여줍니다).</p>
    <div class="mpick">${mPick}</div>
    <div class="pch" style="height:380px"><canvas id="tc"></canvas></div>
  </div>`;

  const series = fieldTrendSeries(TR.eq, tr.name);
  const datasets = TR.metrics.map(m => {
    const s = series[m];
    const pct = s.series.map(v => +(((v - s.lo) / (s.hi - s.lo)) * 100).toFixed(1));
    return { label: `${m} (${s.unit})`, data: pct, borderColor: MCOL[m], backgroundColor: MCOL[m], tension: .3, pointRadius: 2 };
  });
  datasets.push({ label: '정상 상한', data: Array(TREND_DAYS).fill(100), borderColor: '#D93F3F', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });
  datasets.push({ label: '정상 하한', data: Array(TREND_DAYS).fill(0), borderColor: '#B5BEC9', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('tc'), {
    type: 'line',
    data: { labels: trendLabels(), datasets },
    options: { maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { labels: { font: { size: 14, weight: 'bold' } } } },
      scales: { x: { ticks: { font: { size: 12 }, maxTicksLimit: 10 } },
        y: { title: { display: true, text: '정상범위 대비 %' }, suggestedMin: -20, suggestedMax: 120 } } },
  });
}

function rebuild() { document.getElementById('prodView').dataset.built = ''; renderProd(); }

document.getElementById('prodView').addEventListener('click', e => {
  const tu = e.target.closest('[data-tu]'); if (tu) return openTrend(tu.dataset.tu);
  const pp = e.target.closest('[data-pp]'); if (pp) { PV.period = +pp.dataset.pp; return rebuild(); }
});

document.getElementById('trendModal').addEventListener('click', e => {
  if (e.target.id === 'trx' || e.target.id === 'trendModal') return closeTrend();
  const te = e.target.closest('[data-te]'); if (te) { TR.eq = te.dataset.te; return renderTrendModal(); }
  const tm = e.target.closest('[data-tm]'); if (tm) {
    const m = tm.dataset.tm;
    if (TR.metrics.includes(m)) { if (TR.metrics.length > 1) TR.metrics = TR.metrics.filter(x => x !== m); }
    else TR.metrics.push(m);
    return renderTrendModal();
  }
});
