// 1년 치 가상 정지 이력 (2025-11 ~ 2026-10). 시드 고정 → 매번 같은 데이터
// 정지 1건 = 설비 1대가 고장/정비로 선 기간. Stand-by가 받았으면 손실 0, 버틴 시간으로 기록
const HIST = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const months = [];
  for (let i = 0; i < 12; i++) { const d = new Date(2025, 10 + i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const ev = [];
  // 공정마다 고장 잦은 정도가 다르다 (U400·U600이 약함)
  const weak = { U100: .6, U200: .8, U300: .7, U400: 1.6, U500: .9, U600: 1.4, U700: .5, U800: .6 };
  months.forEach((ym, mi) => {
    // 이번 달(10월)은 오늘(10/14) 전까지만
    const days = mi === 11 ? 13 : new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
    for (const u of PLANT) {
      const n = Math.round((2 + rnd() * 3) * weak[u.id]);
      for (let k = 0; k < n; k++) {
        const r = u.roles[Math.floor(rnd() * u.roles.length)];
        const pm = rnd() < 0.3;
        const hours = pm ? 6 : Math.round(REPAIR_HIST[r.name].lo + rnd() * (REPAIR_HIST[r.name].hi - REPAIR_HIST[r.name].lo));
        // Stand-by도 함께 선 경우 (고장 잦은 공정일수록, 정비 중일수록 위험)
        const both = rnd() < (pm ? 0.08 : 0.12) * weak[u.id];
        const bothH = both ? Math.round(hours * (0.3 + rnd() * 0.5)) : 0;
        ev.push({ ym, day: 1 + Math.floor(rnd() * days), uid: u.id, eq: r.tag + (rnd() < 0.8 ? '-1' : '-2'), role: r.name,
          type: pm ? 'pm' : 'fail', hours, thinH: hours - bothH, bothH, loss: u.cap * (1 - r.down) * bothH / 24 });
      }
    }
  });
  const plan = ym => { const days = ym === months[11] ? 13 : new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate(); return PLANT.reduce((a, u) => a + u.plan * days, 0); };
  return { months, ev, plan };
})();

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
