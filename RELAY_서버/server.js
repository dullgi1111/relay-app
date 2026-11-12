// RELAY 서버 — 외부 패키지 없이 Node 내장 http만 사용
// 역할: ① 팀장 앱(RELAY)·현장직원 앱(RELAY Field)을 같은 서버에서 정적 파일로 서빙
//      ② 두 앱이 공유하는 "작업(job)" 데이터를 /api/jobs로 주고받게 한다
// 실행: node server.js  (로컬 포트 8787, 같은 와이파이의 다른 기기에서 http://<이 PC의 IP>:8787/leader/ , /field/ 로 접속)
// Render 등 호스팅에 올리면 PORT를 호스팅이 지정해주므로 process.env.PORT를 우선 사용한다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');
const LEADER_DIR = path.join(ROOT, 'RELAY_팀장_소스');
const FIELD_DIR = path.join(ROOT, 'RELAY_현장직원_소스');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// ── 공유 데이터: 작업(job) = 팀장이 만든 지시 + 현장직원이 채우는 증상/원인/조치 ──
// 서버 재시작하면 초기화되는 메모리 저장(데모용). 처음엔 RELAY Field가 쓰던 샘플 4건으로 시작한다.
let seq = 4;
const JOBS = [
  { id: 1, uid: 'U400', unitName: '분리·증류', eq: 'P442-1', role: '환류 펌프', type: '점검',
    priority: 'high', deadline: '14:00', status: 'open', memo: '진동 증가가 보고되어 Main(P442-1)이 Stand-by(P442-2)로 자동 전환된 상태입니다. 현장에서 P442-1을 점검하고 원인을 확인해 주세요.',
    symptoms: [], cause: null, details: null, ts: Date.now() },
  { id: 2, uid: 'U600', unitName: '용제 회수', eq: 'P631-2', role: '순환 펌프', type: '수리',
    priority: 'urgent', deadline: '17:00', status: 'open', memo: 'P631-2 고장으로 순환이 정지되어 생산이 40%로 떨어졌습니다. 최우선으로 수리 바랍니다.',
    symptoms: [], cause: null, details: null, ts: Date.now() },
  { id: 3, uid: 'U500', unitName: '정제', eq: 'P542-1', role: '원료 펌프', type: '계획정비',
    priority: 'normal', deadline: '11/7', status: 'open', memo: 'AI 예방정비 일정에 따른 계획정비입니다. 정비 중 Stand-by(P542-2)의 AI 고장위험이 높게 나와 판단이 필요한 건으로 함께 표시되어 있습니다.',
    symptoms: [], cause: null, details: null, ts: Date.now() },
  { id: 4, uid: 'U100', unitName: '원료 전처리', eq: 'P112-1', role: '원료 펌프', type: '점검',
    priority: 'normal', deadline: '11/6', status: 'done', memo: '정기 순회점검입니다. 이상 없음으로 완료 처리되었습니다.',
    symptoms: [], cause: null, details: null, ts: Date.now() },
];

function send(res, status, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', c => { chunks += c; if (chunks.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveStatic(baseDir, urlPath, res) {
  const rel = decodeURIComponent(urlPath) || '/index.html';
  const full = path.normalize(path.join(baseDir, rel === '/' ? '/index.html' : rel));
  if (!full.startsWith(baseDir)) return send(res, 403, 'Forbidden');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found: ' + rel);
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // ── CORS: file://로 그냥 연 index.html(현장 앱)에서도 fetch가 되도록 전부 허용 ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ── API ──
  if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, JOBS);

  if (p === '/api/jobs' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const job = { id: ++seq, uid: b.uid, unitName: b.unitName || '', eq: b.eq, role: b.role,
        type: b.type || '점검', priority: b.priority || 'normal', deadline: b.deadline || '',
        status: 'open', memo: b.memo || '', symptoms: [], cause: null, details: null, ts: Date.now() };
      JOBS.unshift(job);
      return send(res, 201, job);
    } catch { return send(res, 400, 'Bad JSON'); }
  }

  const m = p.match(/^\/api\/jobs\/(\d+)$/);
  if (m && (req.method === 'PUT' || req.method === 'PATCH')) {
    const job = JOBS.find(j => j.id === +m[1]);
    if (!job) return send(res, 404, 'Not found');
    try {
      const b = await readBody(req);
      Object.assign(job, b);
      job.ts2 = Date.now(); // 마지막 수정 시각(참고용)
      return send(res, 200, job);
    } catch { return send(res, 400, 'Bad JSON'); }
  }

  // ── 정적 파일 ──
  if (p === '/' || p === '') {
    const ip = localIPs()[0];
    const fieldUrl = ip ? `http://${ip}:${PORT}/field/` : `http://localhost:${PORT}/field/`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(fieldUrl)}`;
    return send(res, 200, `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;max-width:520px">
      <h2>RELAY 서버 켜짐</h2>
      <p><a href="/leader/" style="font-size:18px">팀장 앱 (RELAY) 열기 →</a></p>
      <hr style="margin:28px 0">
      <p style="font-size:15px;color:#555">현장직원 앱은 <b>폰 카메라로 아래 QR코드를 스캔</b>해서 여세요 (같은 와이파이여야 합니다. QR코드 자체를 보려면 이 페이지를 띄운 PC는 인터넷이 돼 있어야 해요).</p>
      <img src="${qrSrc}" width="220" height="220" alt="QR" style="border:1px solid #ddd;border-radius:8px">
      <p style="font-size:13px;color:#888;margin-top:10px">직접 입력: <a href="${fieldUrl}">${fieldUrl}</a></p>
      <p style="font-size:13px;color:#888">(처음 스캔한 뒤 브라우저 메뉴에서 "홈 화면에 추가"를 누르면, 다음부터는 폰 홈 화면 아이콘 하나로 바로 켜집니다)</p>
    </body>`);
  }
  if (p.startsWith('/leader/')) return serveStatic(LEADER_DIR, p.slice('/leader'.length), res);
  if (p.startsWith('/field/')) return serveStatic(FIELD_DIR, p.slice('/field'.length), res);

  send(res, 404, 'Not found');
});

function localIPs() {
  const nets = os.networkInterfaces(), out = [];
  for (const name of Object.keys(nets)) for (const n of nets[name]) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RELAY 서버 실행 중 — 포트 ${PORT}`);
  console.log(`이 PC에서: http://localhost:${PORT}/leader/  http://localhost:${PORT}/field/`);
  localIPs().forEach(ip => console.log(`같은 와이파이의 다른 기기에서: http://${ip}:${PORT}/field/`));
});
