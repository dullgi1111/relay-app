// 첫 화면: 공정 카드 + 오른쪽 요약
const ST = {
  ok:   { c: '#2E9E6A', t: '정상' },
  thin: { c: '#E59A0B', t: '여유 상실' },
  down: { c: '#D93F3F', t: '감산·정지' },
};
const $ = s => document.querySelector(s);

function cardHTML(u) {
  const { st, rate } = unitState(u);
  const thin = u.roles.filter(r => roleState(r) !== 'ok');
  const say = st === 'ok'
    ? '모든 라인 Main 운전<small>Stand-by 대기 중</small>'
    : thin.flatMap(r => r.units.filter(x => x.st === 'fail' || x.st === 'pm')
        .map(x => `${x.id} ${x.st === 'pm' ? '정비' : '고장'}`)).join(' · ') + `<small>${st === 'thin' ? 'Stand-by로 운전 중 · 하나 더 서면 멈춤' : '두 라인 모두 정지'}</small>`;
  const eta = u.eta ? `복구 예정 ${u.eta}` : (st === 'ok' ? '' : '복구 예정 미입력');
  return `<div class="rc ${st}" style="--c:${ST[st].c}" data-u="${u.id}">
    <div class="t"><span class="no">${u.id}</span><span class="st">${ST[st].t}</span></div>
    <div class="nm">${u.name}</div>
    <div class="say">${say}</div>
    <div class="rate"><b>${Math.round(rate * 100)}%</b> 생산율 <span>${eta}</span></div>
    <div class="bar"><i style="width:${rate * 100}%;background:${ST[st].c}"></i></div>
  </div>`;
}

function render() {
  const box = $('#cards');
  if (!box.children.length) box.innerHTML = PLANT.map(cardHTML).join('');
  PLANT.forEach((u, i) => { const h = cardHTML(u), el = box.children[i];
    if (el.dataset.h !== h) { const fl = el.classList.contains('flash'); el.outerHTML = h;
      box.children[i].dataset.h = h; if (fl) box.children[i].classList.add('flash'); } });
  const sts = PLANT.map(unitState);
  const cnt = k => sts.filter(s => s.st === k).length;
  $('#sum').innerHTML = ['ok', 'thin', 'down'].map(k =>
    `<div class="s" style="--c:${ST[k].c}"><b>${cnt(k)}</b>${ST[k].t}</div>`).join('');
  const prod = PLANT.reduce((a, u, i) => a + u.cap * sts[i].rate, 0);
  const plan = PLANT.reduce((a, u) => a + u.plan, 0);
  $('#kpi').innerHTML = `
    <div><span>Stand-by로 버틴 시간</span><b>${(SIM.thinMin / 60).toFixed(1)} h</b></div>
    <div><span>생산 속도 (계획 대비)</span><b>${Math.round(prod / plan * 100)}%</b></div>
    <div><span>오늘 생산 손실</span><b>${SIM.loss.toFixed(0)} t</b></div>`;
  $('#now').textContent = '10/14 (화) ' + hhmm(SIM.min);
  const key = SIM.log.length + ':' + (SIM.log[0] || {}).m;
  if (render.logKey !== key) render.logKey = key, $('#log').innerHTML = SIM.log.length ? SIM.log.slice(0, 6).map(e =>
    `<div><time>${hhmm(e.m)}</time><b>${e.uid}</b>${e.txt}</div>`).join('') : '<div class="none">아직 변화 없음</div>';
  if (typeof renderDrawer === 'function') renderDrawer();
  if (typeof renderFlow === 'function') renderFlow();
  if (typeof renderProd === 'function') renderProd();
  if (typeof renderTodo === 'function') renderTodo();
  if (typeof renderRisk === 'function') renderRisk();
  if (typeof renderOrders === 'function') renderOrders();
}

// 1920×1080 무대를 창 크기에 맞춰 축소
function fit() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('#stage').style.transform = `translate(${(innerWidth - 1920 * k) / 2}px,${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
}
addEventListener('resize', fit);
fit(); render();
$('#play').onclick = () => { SIM.playing = !SIM.playing; $('#play').textContent = SIM.playing ? '❚❚' : '▶'; };
document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => {
  SIM.speed = +b.dataset.sp; document.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b)); });
