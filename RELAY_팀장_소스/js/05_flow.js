// 라인 흐름도: 한 공정의 단계를 왼쪽→오른쪽으로, 단계마다 Main/Stand-by 두 줄
let flowId = 'U400';
const PC = { run: '#2E9E6A', standby: '#B5BEC9', fail: '#D93F3F', pm: '#E59A0B' };

// hex 색을 amt(-1~1)만큼 어둡게/밝게 — 배관을 원통형으로 보이게 하는 데 사용
function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p) + r; g = Math.round((t - g) * p) + g; b = Math.round((t - b) * p) + b;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function flowSVG(u) {
  const W = 1800, H = 640, X0 = 120, SW = 300, YM = 200, YS = 420, YC = 310;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">`;
  // 원료 → 첫 단계, 마지막 단계 → 제품 (공정 생산율이 0이면 흐름 멈춤)
  const { st, rate } = unitState(u);
  const flowing = rate > 0;
  // 배관을 원통형처럼: 어두운 외곽선 + 본체색 + 밝은 하이라이트 줄 3겹으로, 꺾이는 곳도 한 번에 이어 그린다(linejoin round)
  const pipePath = (pts, c, on) => {
    const d = 'M' + pts.map(p => p.join(' ')).join(' L');
    const dark = shade(c, -0.42), light = shade(c, 0.55);
    let p = `<path d="${d}" stroke="${dark}" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" stroke="${c}" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, off = 4;
      p += `<path d="M${x1 + nx * off} ${y1 + ny * off} L${x2 + nx * off} ${y2 + ny * off}" stroke="${light}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`;
    }
    if (on) p += `<path class="fl" d="${d}" stroke="#fff" stroke-width="4" stroke-dasharray="10 22" fill="none" opacity=".75" stroke-linejoin="round"/>`;
    return p;
  };
  const pipe = (x1, y1, x2, y2, c, on) => pipePath([[x1, y1], [x2, y2]], c, on);

  // 카드 배경(박스)을 전부 먼저 그리고, 배관/설비는 그 위에 나중에 그린다 —
  // 그래야 다음 단계 박스 배경이 이전 배관의 끝부분을 덮어서 끊겨 보이는 일이 없다
  let boxes = '', pipes = '', equip = '';
  u.roles.forEach((r, i) => {
    const a = X0 + i * SW, b = a + SW - 60, c = (a + b) / 2, rs = roleState(r);
    boxes += `<rect x="${a - 10}" y="60" width="${b - a + 20}" height="${H - 110}" rx="18" class="stg ${rs}"/>`;
    pipes += `<text x="${c}" y="100" class="sn">${STAGES[r.stage]}</text><text x="${c}" y="126" class="rn">${r.name}</text>`;
  });

  // 실제로 흐르고 있는(운전 중인) 줄은 공정을 가로질러 끊김 없이 하나의 경로로 이어서 그린다.
  // 대기/고장 쪽만 각 설비 구간에서 따로 그려진다 (그쪽은 실제로 흐르지 않으니 끊어져 보여도 맞다)
  const run = [null, null]; // 레인(0=위, 1=아래)별로 지금 이어 그리는 중인 경로
  const flushLane = k => { if (run[k]) pipes += pipePath(run[k].pts, run[k].col, run[k].on); run[k] = null; };
  u.roles.forEach((r, i) => {
    const a = X0 + i * SW, b = a + SW - 60;
    const activeK = r.units.findIndex(x => x.st === 'run'); // 지금 이 역할에서 실제로 도는 줄 (없으면 -1)
    [0, 1].forEach(k => {
      const x = r.units[k], y = k ? YS : YM, col = PC[x.st];
      if (!run[k]) run[k] = { pts: [[a, YC]], col, on: x.st === 'run' };
      else if (run[k].col !== col) { flushLane(k); run[k] = { pts: [[a, YC]], col, on: x.st === 'run' }; }
      run[k].pts.push([a + 30, y], [b - 30, y], [b, YC]);
    });
    if (i < u.roles.length - 1) {
      if (activeK >= 0) { run[activeK].pts.push([b + 60, YC]); flushLane(1 - activeK); } // 흐르는 줄만 다음 단계까지 이어서
      else { flushLane(0); flushLane(1); pipes += pipe(b, YC, b + 60, YC, '#B5BEC9', false); } // 둘 다 정지면 트렁크는 독립적으로(정지 표시)
    }
  });
  flushLane(0); flushLane(1);

  // 설비 아이콘(펌프 하우징)은 배관 맨 위에 — 누르면 이 공정의 상세보기(드로어)가 열린다
  u.roles.forEach((r, i) => {
    const a = X0 + i * SW, b = a + SW - 60, c = (a + b) / 2;
    r.units.forEach((x, k) => {
      const y = k ? YS : YM, col = PC[x.st];
      equip += `<g data-eq="${x.id}" style="cursor:pointer">`;
      equip += `<circle cx="${c}" cy="${y}" r="36" fill="#fff" stroke="#8891A0" stroke-width="3"/>`;
      equip += `<circle cx="${c}" cy="${y}" r="33" fill="none" stroke="${col}" stroke-width="5"/>`;
      for (let d = 0; d < 8; d++) { const a2 = d / 8 * Math.PI * 2;
        equip += `<circle cx="${c + Math.cos(a2) * 36}" cy="${y + Math.sin(a2) * 36}" r="2.2" fill="#6B7685"/>`; }
      if (x.st === 'run') equip += `<g class="spin" style="transform-origin:${c}px ${y}px"><path d="M${c - 16} ${y} L${c + 16} ${y} M${c} ${y - 16} L${c} ${y + 16}" stroke="${col}" stroke-width="6" stroke-linecap="round"/></g>`;
      if (x.st === 'fail') equip += `<path d="M${c - 15} ${y - 15} L${c + 15} ${y + 15} M${c + 15} ${y - 15} L${c - 15} ${y + 15}" stroke="${col}" stroke-width="7" stroke-linecap="round"/>`;
      if (x.st === 'pm') equip += `<text x="${c}" y="${y + 9}" class="pm">정비</text>`;
      if (x.st === 'standby') equip += `<circle cx="${c}" cy="${y}" r="8" fill="${col}"/>`;
      equip += `<text x="${c}" y="${y + 66}" class="un">${x.id}</text><text x="${c}" y="${y + 90}" class="us" fill="${col === PC.standby ? '#6B7685' : col}">${k ? 'Stand-by' : 'Main'} · ${UST[x.st][0]}</text>`;
      equip += `</g>`;
    });
  });

  pipes = `<text x="40" y="${YC - 30}" class="ft">원료</text>` + pipe(40, YC, X0, YC, '#2E9E6A', flowing) + pipes;
  const end = X0 + u.roles.length * SW - 60;
  pipes += pipe(end, YC, end + 80, YC, flowing ? ST[st].c : '#B5BEC9', flowing) + `<text x="${end + 20}" y="${YC - 30}" class="ft">제품 ${Math.round(rate * 100)}%</text>`;
  return s + boxes + pipes + equip + '</svg>';
}

function renderFlow() {
  const v = document.getElementById('flowView'); if (!v || v.hidden) return;
  const u = unit(flowId), { st, rate } = unitState(u);
  const pick = PLANT.map(p => { const s = unitState(p).st;
    return `<button class="${p.id === flowId ? 'on' : ''}" style="--c:${ST[s].c}" data-fu="${p.id}">${p.id}<small>${ST[s].t}</small></button>`; }).join('');
  const thin = u.roles.filter(r => roleState(r) !== 'ok');
  const msg = st === 'ok' ? '모든 단계가 Main으로 운전 중이고 Stand-by가 대기하고 있습니다.'
    : thin.map(r => `<b>${STAGES[r.stage]}</b> ${roleState(r) === 'thin' ? 'Stand-by 한 줄로 버티는 중' : '두 줄 모두 정지 → 생산 ' + Math.round(r.down * 100) + '%'}`).join(' · ');
  const h = `<div class="fpick">${pick}</div>
    <section class="card fcard"><h3>${u.id} ${u.name} <small>${u.eta ? '복구 예정 ' + u.eta : ''}</small></h3>
    <div class="fmsg" style="--c:${ST[st].c}"><span>${ST[st].t}</span>${msg}</div>
    <div class="fsvg">${flowSVG(u)}</div>
    <div class="fkey"><i style="background:${PC.run}"></i>운전 <i style="background:${PC.standby}"></i>대기 <i style="background:${PC.fail}"></i>고장 <i style="background:${PC.pm}"></i>정비</div></section>`;
  if (v.dataset.h !== h) { v.innerHTML = h; v.dataset.h = h; }
}

function showView(name, uid) {
  if (uid) flowId = uid;
  document.querySelector('main').hidden = name !== 'now';
  document.getElementById('flowView').hidden = name !== 'flow';
  document.getElementById('prodView').hidden = name !== 'prod';
  document.getElementById('riskView').hidden = name !== 'risk';
  document.getElementById('ordersView').hidden = name !== 'orders';
  document.getElementById('riskView').dataset.built = '';
  if (name === 'prod') rebuild();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  closeDrawer(); render();
}

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => b.dataset.view && showView(b.dataset.view));
document.getElementById('flowView').addEventListener('click', e => {
  const b = e.target.closest('[data-fu]'); if (b) { flowId = b.dataset.fu; render(); return; }
  const eq = e.target.closest('[data-eq]'); if (eq) openEqDetail(eq.dataset.eq);
});

// 설비 하나 클릭 → 그 설비만 자세히 보는 팝업 (메인 화면 카드 클릭의 전체 드로어와는 별개)
const BTN_OUTLINE = 'width:auto;height:44px;white-space:nowrap;border:1.5px solid var(--line);background:#fff;border-radius:10px;padding:0 18px;font-weight:800;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center';
let eqOrderFor = null, eqOrderOpen = false;
const ORDER_DEFAULT_DRAFT = () => ({ type: '점검', priority: 'normal', date: '2026-10-14', time: '', memo: '' });
let eqOrderDraft = ORDER_DEFAULT_DRAFT();
const ORDER_TYPES = ['점검', '수리', '계획정비'];
const ORDER_PR = { urgent: '긴급', high: '우선', normal: '보통' };

// 날짜·시간 선택값을 "10/14 14:00" 같은 표시용 문자열로 합친다
function combineDeadline(draft) {
  let out = '';
  if (draft.date) { const [, m, d] = draft.date.split('-'); out += `${+m}/${+d}`; }
  if (draft.time) out += (out ? ' ' : '') + draft.time;
  return out;
}

// 현장에 발행한 지시 — "지시 목록" 탭과 설비 상세 팝업이 공유한다.
// RELAY 서버(/leader/, /field/를 같이 서빙)가 떠 있으면 /api/jobs로도 주고받는다 — 없으면 로컬로만 동작.
const ORDERS = [];
let ordSeq = 0;
function issueOrder(eqId, draft) {
  const { u, r, x } = findEq(eqId);
  const prLabel = ORDER_PR[draft.priority];
  const deadline = combineDeadline(draft);
  const job = { id: ++ordSeq, ts: Date.now(), uid: u.id, unitName: u.name, eq: x.id, role: r.name, st: x.st, status: 'open',
    type: draft.type, priority: draft.priority, priorityLabel: prLabel, date: draft.date, time: draft.time, deadline, memo: draft.memo,
    symptoms: [], cause: null, details: null };
  ORDERS.unshift(job);
  SIM.log.unshift({ m: SIM.min, uid: u.id, txt: `${x.id} 현장 점검 지시 발행 — ${draft.type} · ${prLabel}${deadline ? ' · 마감 ' + deadline : ''}${draft.memo ? ' · "' + draft.memo + '"' : ''}` });
  fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: u.id, unitName: u.name, eq: x.id, role: r.name, type: draft.type, priority: draft.priority, deadline, memo: draft.memo }) })
    .then(res => res.ok ? res.json() : null).then(serverJob => { if (serverJob) job.id = serverJob.id; }).catch(() => {});
}
function cancelOrder(id) {
  const o = ORDERS.find(x => x.id === id); if (!o || o.status === 'cancelled') return;
  o.status = 'cancelled';
  SIM.log.unshift({ m: SIM.min, uid: o.uid, txt: `${o.eq} 현장 지시 취소 — ${o.type} · ${o.priorityLabel}` });
  fetch('/api/jobs/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }).catch(() => {});
}
function updateOrder(id, eqId, draft) {
  const o = ORDERS.find(y => y.id === id); if (!o) return;
  const { u, r, x } = findEq(eqId);
  const prLabel = ORDER_PR[draft.priority];
  const deadline = combineDeadline(draft);
  Object.assign(o, { uid: u.id, unitName: u.name, eq: x.id, role: r.name, st: x.st, type: draft.type, priority: draft.priority,
    priorityLabel: prLabel, date: draft.date, time: draft.time, deadline, memo: draft.memo });
  SIM.log.unshift({ m: SIM.min, uid: u.id, txt: `${x.id} 현장 지시 수정 — ${draft.type} · ${prLabel}${deadline ? ' · 마감 ' + deadline : ''}` });
  fetch('/api/jobs/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: u.id, unitName: u.name, eq: x.id, role: r.name, type: draft.type, priority: draft.priority, deadline, memo: draft.memo }) }).catch(() => {});
}

// 서버에서 작업 목록을 당겨와서 ORDERS에 반영 — 현장직원이 올린 증상/원인/조치/완료 상태가 여기로 들어온다
async function syncOrdersFromServer() {
  try {
    const res = await fetch('/api/jobs'); if (!res.ok) return;
    const jobs = await res.json();
    if (!Array.isArray(jobs)) return;
    jobs.forEach(j => {
      let o = ORDERS.find(x => x.id === j.id);
      if (!o) { o = { date: '', time: '' }; ORDERS.push(o); }
      Object.assign(o, { id: j.id, ts: o.ts || j.ts, uid: j.uid, unitName: j.unitName, eq: j.eq, role: j.role,
        type: j.type, priority: j.priority, priorityLabel: ORDER_PR[j.priority] || j.priority,
        deadline: j.deadline, status: j.status, memo: j.memo, symptoms: j.symptoms, cause: j.cause, details: j.details });
    });
    render();
  } catch (e) { /* 서버 없음 — 로컬 데이터 그대로 */ }
}
syncOrdersFromServer();
setInterval(syncOrdersFromServer, 5000);

function openEqDetail(eqId) {
  if (eqOrderFor !== eqId) { eqOrderOpen = false; eqOrderDraft = ORDER_DEFAULT_DRAFT(); eqOrderFor = eqId; }
  renderEqModal(eqId);
  document.body.classList.add('eqopen');
}

function renderEqModal(eqId) {
  const { u, r, x } = findEq(eqId);
  const col = UST[x.st][1];
  const body = x.st === 'pm'
    ? `<div class="off" style="margin-top:18px">점검 중 — 측정값 없음</div>`
    : `<div class="dk" style="grid-template-columns:repeat(${fieldReading(r, x).length},1fr);margin-top:18px">
        ${fieldReading(r, x).map(v => `<div><span>${v.label}</span><b style="${v.bad ? 'color:#D93F3F' : ''}">${v.v}${v.unit}</b></div>`).join('')}
      </div>`;
  const ai = (x.st === 'fail' || x.st === 'pm')
    ? `<div class="off" style="margin-top:14px"><b style="color:${col}">AI 수리시간 추정</b><span class="ai">${aiEta(r, x).txt}</span></div>` : '';
  // 현장직원이 올린 증상/원인/조치 — 서버 연동으로 들어온 것 중 이 설비에 대한 가장 최근 것
  const job = ORDERS.filter(o => o.eq === x.id && (o.cause || (o.symptoms && o.symptoms.length))).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const fieldReport = job ? `<div class="off" style="margin-top:14px;border-color:var(--accent)">
    <b style="color:var(--accent)">현장 확인 결과</b>
    ${job.symptoms && job.symptoms.length ? `<span>증상: ${job.symptoms.join(', ')}</span>` : ''}
    ${job.cause ? `<span>원인: ${job.cause.cause}${job.cause.pct ? ` (${job.cause.pct}%)` : ' (직접입력)'}</span>` : ''}
    ${job.details ? `<span>조치: ${job.details.action || ''}${job.details.hours ? ` · ${job.details.hours}h` : ''}${job.details.parts ? ` · 부품: ${job.details.parts}` : ''}</span>` : ''}
  </div>` : '';
  const orderForm = eqOrderOpen ? `
    <div class="off" style="margin-top:14px">
      <b style="color:${col}">현장 지시 작성 — ${x.id}</b>
      <div class="pbar" style="margin:10px 0 0">${ORDER_TYPES.map(t => `<button data-ot="${t}" class="${eqOrderDraft.type === t ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="pbar" style="margin:8px 0 0">${Object.entries(ORDER_PR).map(([k, label]) => `<button data-op="${k}" class="${eqOrderDraft.priority === k ? 'on' : ''}">${label}</button>`).join('')}</div>
      <div class="eta" style="margin-top:10px;gap:10px"><input id="ordDate" type="date" value="${eqOrderDraft.date}"><input id="ordTime" type="time" value="${eqOrderDraft.time}"></div>
      <textarea id="ordMemo" placeholder="현장에 전달할 메모" style="width:100%;margin-top:8px;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14.5px;min-height:70px;box-sizing:border-box">${eqOrderDraft.memo}</textarea>
      <button class="dbtn" id="ordSend" style="margin-top:10px">지시 발행</button>
    </div>` : '';
  document.getElementById('eqModal').innerHTML = `<div class="ab" style="width:760px">
    <div class="ah">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div><small style="color:${col};font-weight:900">${UST[x.st][0]}</small><b>${x.id} · ${r.name} · ${x === r.units[0] ? 'Main' : 'Stand-by'}</b></div>
        <button id="eqTrendBtn" data-uid="${u.id}" data-eq="${x.id}" style="${BTN_OUTLINE}color:var(--accent)">추세 보기</button>
        <button id="eqOrderBtn" style="${BTN_OUTLINE}color:${eqOrderOpen ? '#fff' : 'var(--accent)'};${eqOrderOpen ? `background:var(--accent);border-color:var(--accent);` : ''}">현장에 지시 보내기</button>
      </div>
      <button id="eqx">✕</button>
    </div>
    ${body}${ai}${fieldReport}${orderForm}
  </div>`;
}
function closeEqDetail() { document.body.classList.remove('eqopen'); }
function syncOrderDraft() {
  const d = document.getElementById('ordDate'), t = document.getElementById('ordTime'), m = document.getElementById('ordMemo');
  if (d) eqOrderDraft.date = d.value;
  if (t) eqOrderDraft.time = t.value;
  if (m) eqOrderDraft.memo = m.value;
}
document.getElementById('eqModal').addEventListener('click', e => {
  if (e.target.id === 'eqx' || e.target.id === 'eqModal') return closeEqDetail();
  const tb = e.target.closest('#eqTrendBtn');
  if (tb) { closeEqDetail(); showView('prod'); return openTrend(tb.dataset.uid, tb.dataset.eq); }
  const ob = e.target.closest('#eqOrderBtn');
  if (ob) { eqOrderOpen = !eqOrderOpen; return renderEqModal(eqOrderFor); }
  const ot = e.target.closest('[data-ot]');
  if (ot) { syncOrderDraft(); eqOrderDraft.type = ot.dataset.ot; return renderEqModal(eqOrderFor); }
  const op = e.target.closest('[data-op]');
  if (op) { syncOrderDraft(); eqOrderDraft.priority = op.dataset.op; return renderEqModal(eqOrderFor); }
  const send = e.target.closest('#ordSend');
  if (send) {
    syncOrderDraft();
    issueOrder(eqOrderFor, eqOrderDraft);
    eqOrderOpen = false;
    closeEqDetail();
    return render();
  }
});
