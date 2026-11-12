// 시연 모드: 가짜 커서가 움직이며 클릭하고, 시계와 맞춰 장면이 흘러간다 (무한 반복)
// 주소에 ?demo 를 붙이거나 [시연] 버튼으로 시작. 녹화용
const DEMO = { on: false, run: 0 };
const stage = document.getElementById('stage');
const cur = document.getElementById('cur');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function stagePos(el) {
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / 1920;
  return { x: (r.left - s.left + r.width / 2) / k, y: (r.top - s.top + r.height / 2) / k };
}
async function moveTo(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null;
  const p = stagePos(el);
  cur.style.transform = `translate(${p.x}px,${p.y}px)`;
  await sleep(800);
  return el;
}
async function click(sel, after = 1200) {
  const id = DEMO.run, el = await moveTo(sel); if (!el || id !== DEMO.run) return;
  cur.classList.remove('rip'); void cur.offsetWidth; cur.classList.add('rip');
  await sleep(180);
  // 패널은 매 분 다시 그려지므로 누르기 직전에 다시 찾는다
  (typeof sel === 'string' ? document.querySelector(sel) || el : el).click(); await sleep(after);
}
async function until(min) { const id = DEMO.run; while (SIM.min < min && id === DEMO.run) await sleep(50); }

// 소개 슬라이드 — 각 장면 앞에 화면 전체로 띄운다 (자막 아님). 임팩트 있는 문구만
const SLIDES = [
  { big: '설비가 멈추면,<br>공정은?', sub: '중소 석유화학 공장을 위한 설비 정지 의사결정지원', brand: true },
  { big: '설비 1대가 아니라<br><em>공정 전체</em>를 본다' },
  { big: '멈추지 않았다.<br>하지만 <em>하나만 더 서면</em> 멈춘다.' },
  { big: '언제 돌아오나 —<br><em>클릭 한 번</em>' },
  { big: 'Main과 Stand-by,<br><em>한눈에</em>' },
  { big: 'AI는 고르지 않는다.<br><em>비교한다.</em>' },
  { big: '1년 손실 <em>23억 원</em>.', sub: '그리고 1,688시간 — 하나만 더 서면 멈췄다.' },
  { big: '서버 없이. 설치 없이.<br><em>파일 하나.</em>', brand: true },
];
DEMO.marks = [];   // 녹화 편집용 장면 시작 시각
async function slide(i, ms = 4000) {
  const sl = SLIDES[i], el = document.getElementById('slide'), was = SIM.playing;
  DEMO.marks.push({ scene: i, t: Date.now() });
  SIM.playing = false;
  el.innerHTML = `${sl.brand ? '<div class="sb1"><span>R</span>RELAY</div>' : `<div class="sn1">${i}</div>`}<h1>${sl.big}</h1>${sl.sub ? `<p>${sl.sub}</p>` : ''}`;
  document.body.classList.add('sopen'); await sleep(ms);
  document.body.classList.remove('sopen'); await sleep(500);
  SIM.playing = was; last = performance.now();
}

async function tour() {
  const id = ++DEMO.run, alive = () => id === DEMO.run;
  while (alive()) {
    closeAlt(); showView('now'); reset(); render(); SIM.speed = 12; SIM.playing = false;
    await slide(0, 5000); if (!alive()) break;
    await slide(1); SIM.playing = true;
    await sleep(4000);
    // 장면 2 — 고장 직전에 소개, 고장 → 카드 노랑
    await until(66); if (!alive()) break; await slide(2); SIM.speed = 1;
    await until(72); await sleep(3000);
    // 장면 3 — 사이드 패널 → AI 추정 적용
    await slide(3); if (!alive()) break;
    await click('.rc[data-u="U400"]', 3500);
    await click('#etaAi', 3000);
    // 장면 4 — 라인 흐름도
    await slide(4); if (!alive()) break;
    await click('[data-go="flow"]', 8000);
    await click('.tabs [data-view="now"]', 500); SIM.speed = 12;
    // 장면 5 — 판단이 필요한 건 → 대안 비교
    await until(146); if (!alive()) break; await slide(5); SIM.speed = 1;
    await until(152); await sleep(3000);
    await click('.dec', 10000);
    await click('#ax', 800); SIM.speed = 12;
    // 장면 6 — 감산 → 생산 손실 상세 → 설비 → 이력, 버틴 시간 → 손실 예상
    await until(256); if (!alive()) break; await slide(6); SIM.speed = 1;
    await until(262); await sleep(3000);
    await click('.rc[data-u="U600"]', 3500);
    await click('[data-go="prod"]', 4500);
    await click('#prodView tr[data-de]', 4500);
    await click('#crumb [data-cr=""]', 1500);
    await click('#prodView [data-thin]', 5500);
    await click('.tabs [data-view="risk"]', 7000);
    // 복구까지 빠르게 → 마무리
    await click('.tabs [data-view="now"]', 500); SIM.speed = 40;
    await until(560); if (!alive()) break; await sleep(3000);
    await slide(7, 5000);
    DEMO.marks.push({ scene: 'end', t: Date.now() });
  }
}

function demoStart() { cur.style.transform = 'translate(1200px,600px)'; DEMO.on = true; document.body.classList.add('demo'); tour(); }
function demoStop() { DEMO.on = false; DEMO.run++; document.body.classList.remove('demo'); SIM.speed = 10; }
document.getElementById('demoBtn').onclick = () => DEMO.on ? demoStop() : demoStart();
if (location.search.includes('demo')) demoStart();
