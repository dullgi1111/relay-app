// 지시 목록 탭: 날짜별로 발행한 지시 목록 + 새 지시 추가 / 수정 / 상세보기
let ordAddOpen = false, ordAddUid = 'U100', ordAddEq = null, ordEditingId = null;
let ordAddDraft = ORDER_DEFAULT_DRAFT();

function renderOrders() {
  const v = document.getElementById('ordersView'); if (!v || v.hidden) return;
  // 입력 중에는 다시 그리지 않는다 (타이핑이 날아가지 않도록)
  if (document.activeElement && ['addMemo', 'addDate', 'addTime'].includes(document.activeElement.id)) return;

  if (!ordAddEq) ordAddEq = unit(ordAddUid).roles[0].units[0].id;
  const proc = unit(ordAddUid);
  const procPick = PLANT.map(p => `<button data-ou="${p.id}" class="${p.id === ordAddUid ? 'on' : ''}" style="--c:#2F5D8A">${p.id}<small>${p.name}</small></button>`).join('');
  const eqPick = proc.roles.flatMap(r => r.units.map((x, k) =>
    `<button data-oe="${x.id}" class="${x.id === ordAddEq ? 'on' : ''}" style="--c:${PC[x.st]}">${x.id}<small>${r.name}·${k ? 'Stand-by' : 'Main'}</small></button>`)).join('');

  const addForm = ordAddOpen ? `
    <div style="border:1.5px solid var(--line);border-radius:16px;padding:20px 22px;margin-bottom:16px;background:var(--chip)">
      <div style="font-size:17px;font-weight:800;margin-bottom:12px">${ordEditingId ? '지시 수정' : '새 지시 작성'}</div>
      <div class="fpick">${procPick}</div>
      <div class="fpick" style="margin-top:10px">${eqPick}</div>
      <div class="pbar" style="margin-top:12px">${ORDER_TYPES.map(t => `<button data-at="${t}" class="${ordAddDraft.type === t ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="pbar" style="margin-top:8px">${Object.entries(ORDER_PR).map(([k, label]) => `<button data-ap="${k}" class="${ordAddDraft.priority === k ? 'on' : ''}">${label}</button>`).join('')}</div>
      <div class="eta" style="margin-top:10px;gap:10px"><input id="addDate" type="date" value="${ordAddDraft.date}"><input id="addTime" type="time" value="${ordAddDraft.time}"></div>
      <textarea id="addMemo" placeholder="현장에 전달할 메모" style="width:100%;margin-top:8px;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14.5px;min-height:70px;box-sizing:border-box">${ordAddDraft.memo}</textarea>
      <button class="dbtn" id="addSend" style="margin-top:12px">${ordEditingId ? '지시 저장' : '지시 발행'}</button>
    </div>` : '';

  const groups = {};
  ORDERS.forEach(o => { const key = new Date(o.ts).toLocaleDateString('ko-KR'); (groups[key] = groups[key] || []).push(o); });
  const dateKeys = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
  const statusTag = o => o.status === 'cancelled' ? ' · <span style="color:#D93F3F;font-weight:800">취소됨</span>'
    : o.status === 'done' ? ' · <span style="color:#2E9E6A;font-weight:800">완료</span>' : '';
  const fieldSummary = o => {
    const parts = [];
    if (o.cause) parts.push(`원인: ${o.cause.cause}`);
    if (o.details && o.details.action) parts.push(`조치: ${o.details.action}${o.details.hours ? ` (${o.details.hours}h)` : ''}`);
    return parts.length ? `<span>${parts.join(' · ')}</span>` : '';
  };
  const list = dateKeys.length ? dateKeys.map(dk => `
    <div style="margin-bottom:18px">
      <div style="font-weight:800;font-size:15px;color:var(--muted);margin-bottom:8px">${dk}</div>
      ${groups[dk].slice().sort((a, b) => b.ts - a.ts).map(o => `
        <div class="orditem${o.status === 'cancelled' ? ' cancelled' : ''}">
          <div class="oi-info">
            <b>${o.eq} · ${o.role} · ${o.priorityLabel}${statusTag(o)}</b>
            <span>${o.type}${o.deadline ? ' · 마감 ' + o.deadline : ''} · 발행 ${new Date(o.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            ${o.memo ? `<span>${o.memo}</span>` : ''}
            ${fieldSummary(o)}
          </div>
          <div class="oi-btns">
            ${o.status === 'open' ? `<button data-oedit="${o.id}">지시 수정하기</button><button data-ocancel="${o.id}">지시 취소하기</button>` : ''}
            <button data-oview="${o.id}">상세보기</button>
          </div>
        </div>`).join('')}
    </div>`).join('')
    : `<div class="empty">아직 발행한 지시가 없습니다.<small>"지시 추가하기"로 새로 작성하거나, 설비 상세 팝업(라인 흐름도)에서 바로 보낼 수 있습니다.</small></div>`;

  const h = `<section class="card" style="flex:1;overflow:auto">
    <h3><span>지시 목록 <small>날짜별 · 현장에 발행한 지시</small></span><button class="ordaddbtn" id="ordAddBtn">${ordAddOpen ? '취소' : '+ 지시 추가하기'}</button></h3>
    <div style="padding:0 22px 22px">${addForm}${list}</div>
  </section>`;
  if (v.dataset.h !== h) { v.innerHTML = h; v.dataset.h = h; }
}

function syncOrdAddDraft() {
  const d = document.getElementById('addDate'), t = document.getElementById('addTime'), m = document.getElementById('addMemo');
  if (d) ordAddDraft.date = d.value;
  if (t) ordAddDraft.time = t.value;
  if (m) ordAddDraft.memo = m.value;
}

function startEditOrder(id) {
  const o = ORDERS.find(x => x.id === id); if (!o) return;
  ordEditingId = id;
  ordAddUid = o.uid; ordAddEq = o.eq;
  ordAddDraft = { type: o.type, priority: o.priority, date: o.date, time: o.time, memo: o.memo };
  ordAddOpen = true;
  renderOrders();
}

function openOrderView(id) {
  const o = ORDERS.find(x => x.id === id); if (!o) return;
  const statusColor = o.status === 'cancelled' ? '#D93F3F' : o.status === 'done' ? '#2E9E6A' : 'var(--accent)';
  const statusLabel = o.status === 'cancelled' ? ' · 취소됨' : o.status === 'done' ? ' · 완료' : '';
  const hasReport = (o.symptoms && o.symptoms.length) || o.cause || o.details;
  const report = hasReport ? `<div class="off" style="margin-top:14px;border-color:var(--accent)">
    <b style="color:var(--accent)">현장 확인 결과</b>
    ${o.symptoms && o.symptoms.length ? `<span>증상: ${o.symptoms.join(', ')}</span>` : ''}
    ${o.cause ? `<span>원인: ${o.cause.cause}${o.cause.pct ? ` (${o.cause.pct}%)` : ' (직접입력)'}</span>` : ''}
    ${o.details ? `<span>조치: ${o.details.action || ''}${o.details.hours ? ` · ${o.details.hours}h` : ''}${o.details.parts ? ` · 부품: ${o.details.parts}` : ''}</span>` : ''}
  </div>` : `<div class="off" style="margin-top:14px">현장에서 아직 증상/원인/조치를 올리지 않았습니다.</div>`;
  document.getElementById('orderViewModal').innerHTML = `<div class="ab" style="width:640px">
    <div class="ah"><div><small style="color:${statusColor};font-weight:900">${o.priorityLabel}${statusLabel}</small><b>${o.eq} · ${o.role}</b></div><button id="ovx">✕</button></div>
    <div class="dk" style="grid-template-columns:repeat(3,1fr);margin-top:18px">
      <div><span>유형</span><b>${o.type}</b></div>
      <div><span>마감</span><b>${o.deadline || '미지정'}</b></div>
      <div><span>발행 시각</span><b style="font-size:17px">${new Date(o.ts).toLocaleString('ko-KR')}</b></div>
    </div>
    <div class="off" style="margin-top:14px"><b>메모</b><span>${o.memo || '메모 없음'}</span></div>
    ${report}
  </div>`;
  document.body.classList.add('ovopen');
}
function closeOrderView() { document.body.classList.remove('ovopen'); }
document.getElementById('orderViewModal').addEventListener('click', e => {
  if (e.target.id === 'ovx' || e.target.id === 'orderViewModal') closeOrderView();
});

document.getElementById('ordersView').addEventListener('click', e => {
  const ab = e.target.closest('#ordAddBtn');
  if (ab) {
    ordAddOpen = !ordAddOpen;
    if (!ordAddOpen) { ordEditingId = null; ordAddDraft = ORDER_DEFAULT_DRAFT(); }
    else if (!ordEditingId) { ordAddUid = 'U100'; ordAddEq = null; ordAddDraft = ORDER_DEFAULT_DRAFT(); }
    return renderOrders();
  }
  const oedit = e.target.closest('[data-oedit]'); if (oedit) return startEditOrder(+oedit.dataset.oedit);
  const oview = e.target.closest('[data-oview]'); if (oview) return openOrderView(+oview.dataset.oview);
  const ocancel = e.target.closest('[data-ocancel]');
  if (ocancel) { cancelOrder(+ocancel.dataset.ocancel); return render(); }
  const ou = e.target.closest('[data-ou]');
  if (ou) { syncOrdAddDraft(); ordAddUid = ou.dataset.ou; ordAddEq = null; return renderOrders(); }
  const oe = e.target.closest('[data-oe]');
  if (oe) { syncOrdAddDraft(); ordAddEq = oe.dataset.oe; return renderOrders(); }
  const at = e.target.closest('[data-at]');
  if (at) { syncOrdAddDraft(); ordAddDraft.type = at.dataset.at; return renderOrders(); }
  const ap = e.target.closest('[data-ap]');
  if (ap) { syncOrdAddDraft(); ordAddDraft.priority = ap.dataset.ap; return renderOrders(); }
  const send = e.target.closest('#addSend');
  if (send) {
    syncOrdAddDraft();
    if (ordEditingId) updateOrder(ordEditingId, ordAddEq, ordAddDraft);
    else issueOrder(ordAddEq, ordAddDraft);
    ordAddOpen = false;
    ordEditingId = null;
    ordAddDraft = ORDER_DEFAULT_DRAFT();
    return renderOrders();
  }
});
