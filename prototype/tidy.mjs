#!/usr/bin/env node
// TIDY 동작 프로토타입 — target − inventory = gap 계산
// 실행: node prototype/tidy.mjs
// 알고리즘 출처: 01-design.md §3 · 데이터: data/*.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const modules = load('modules.json').modules;
const target = load('target.json');
const taxonomy = load('taxonomy.json');

const SEASON_KO = { summer: '여름', winter: '겨울', shoulder: '간절기', allseason: '공용' };
const ROLE_KO = { TOP:'상의', BOTTOM:'하의', OUTER:'아우터', SHOES:'신발', SET:'상하세트',
  SUITSET:'정장셋', DRESS_SHIRT:'드레스셔츠', TIE:'넥타이', UNDERWEAR:'속옷', SOCKS:'양말',
  INNER_SHIRT:'이너셔츠', THERMAL:'내복' };
const CUR_SEASON = 'summer'; // 2026-07 기준

// ── 계절 버킷 매핑: garment.season → target 버킷
const seasonBucket = (s) => ({ SUMMER:'summer', WINTER:'winter', SHOULDER:'shoulder',
  SPRING:'shoulder', FALL:'shoulder', ALL_SEASON:'allseason' }[s] || 'allseason');

// ── 추론 (01-design §3.1~3.4) : 이름 문자열 substring 매칭
const matchDict = (name, dict) => {
  for (const [k, v] of Object.entries(dict)) if (name.includes(k)) return v;
  return null;
};
const inferSeasonRaw = (name) => {
  if (/(린넨|반팔|반바지|메시)/.test(name)) return 'SUMMER';
  if (/(기모|패딩|울코트|두꺼운)/.test(name)) return 'WINTER';
  if (/(가디건|트렌치|얇은)/.test(name)) return 'SHOULDER';
  return 'ALL_SEASON';
};
const inferRole = (name) => matchDict(name, taxonomy.roleKeywords) || 'TOP';
const suggestModule = (name, hint) => matchDict(name, taxonomy.moduleKeywords) || hint || 'INBOX';
const normalizeColor = (raw) => {
  if (!raw) return 'WHITE';
  return taxonomy.colorSynonyms[raw] || (raw === raw.toUpperCase() ? raw : 'WHITE');
};

const TODAY = new Date('2026-07-06');
const daysSince = (d) => d ? Math.round((TODAY - new Date(d)) / 864e5) : Infinity;
const monthsOwned = (g) => Math.max(1, daysSince(g.acquiredAt) / 30);

// ── 등록 (01-design §3.1)
let seq = 0;
function register(input) {
  const name = input.name;
  const g = {
    id: 'g' + (++seq),
    name,
    module: input.module ?? suggestModule(name, input.moduleHint),
    role: input.role ?? inferRole(name),
    season: input.season ?? inferSeasonRaw(name),
    colors: (input.colors ?? [input.color]).filter(Boolean).map(normalizeColor),
    condition: input.condition ?? 'NEW',
    wearCount: input.wearCount ?? 0,
    lastWornAt: input.lastWornAt ?? null,
    acquiredAt: input.acquiredAt ?? '2026-07-06',
    borrowCount: input.borrowCount ?? 0,
    weather: input.weather ?? [],   // 날씨 능력 태그 (RAIN/WIND/COLD/HOT_HUMID)
    active: true,
  };
  if (!g.colors.length) g.colors = ['WHITE'];
  return g;
}

// ── 모듈 감사 (01-design §3.9): 목표 − 보유 = gap
function auditModule(inventory) {
  const report = [];
  for (const m of modules) {
    const tgt = target.modules[m.id]?.targets || {};
    const rows = [];
    let mTarget = 0, mOwned = 0;
    const counted = new Set();
    // 커버리지 카운팅 (01-design §3.3.1): 계절 전용은 자기 칸만, ALL_SEASON만 gap 유동 필러
    for (const [role, buckets] of Object.entries(tgt)) {
      const items = inventory.filter(g => g.active && g.module === m.id && g.role === role);
      const byB = {};
      for (const g of items) (byB[seasonBucket(g.season)] ??= []).push(g);
      const cell = {};
      // 1) 계절 전용(summer/winter/shoulder) 정확 매칭
      for (const bucket of Object.keys(buckets)) {
        if (bucket === 'allseason') continue;
        cell[bucket] = (byB[bucket] || []).slice();
        cell[bucket].forEach(g => counted.add(g.id));
      }
      // 2) ALL_SEASON: allseason 목표 칸을 먼저 채우고, 남는 것만 유연 필러 풀로
      const asAll = byB['allseason'] || [];
      const asNeed = buckets['allseason'] || 0;
      if (buckets['allseason'] != null) {
        cell['allseason'] = asAll.slice(0, asNeed);
        cell['allseason'].forEach(g => counted.add(g.id));
      }
      const flex = asAll.slice(asNeed);   // 유연 필러 (사철 잉여분)
      // 3) 유연 필러를 부족한 계절 칸에 배분
      for (const bucket of ['summer', 'winter', 'shoulder']) {
        if (buckets[bucket] == null) continue;
        let gap = buckets[bucket] - cell[bucket].length;
        while (gap > 0 && flex.length) { const g = flex.shift(); cell[bucket].push(g); counted.add(g.id); gap--; }
      }
      // 4) 행/집계
      for (const [bucket, need] of Object.entries(buckets)) {
        const owned = cell[bucket].length;
        const flexUsed = (cell[bucket] || []).filter(g => seasonBucket(g.season) === 'allseason' && bucket !== 'allseason').length;
        mTarget += need; mOwned += Math.min(owned, need);
        rows.push({ role, bucket, need, owned, gap: Math.max(0, need - owned), flexUsed });
      }
    }
    // 목표 칸에 못 들어간 보유 옷 = 미배정 (역할/계절 보정 필요)
    const unmatched = inventory.filter(g => g.active && g.module === m.id && !counted.has(g.id));
    report.push({ id: m.id, name: m.name, target: mTarget, owned: mOwned,
      gap: mTarget - mOwned, rows, unmatched });
  }
  return report;
}

// ── 비 대비 커버리지 (01-design §1.7b): 각 활성 모듈에 방수 아우터/신발이 있나
function rainReadiness(inventory) {
  return modules.map(m => {
    const rainy = inventory.filter(g => g.active && g.module === m.id && (g.weather || []).includes('RAIN'));
    const hasOuter = rainy.some(g => g.role === 'OUTER');
    const hasShoes = rainy.some(g => g.role === 'SHOES');
    return { id: m.id, name: m.name, ready: rainy.length > 0, hasOuter, hasShoes, items: rainy };
  });
}

// ── "비 오는 날" 질의 (모듈 + 방수 필터)
function rainOutfit(inventory, module) {
  return inventory.filter(g => g.active && g.module === module && (g.weather || []).includes('RAIN'));
}

// ── 색상 배정 (04 §4.2 · 70/20/10)
function allocColors(pal, n) {
  const base = pal.base, sec = pal.secondary || [], acc = pal.accent || [];
  const nAcc = (acc.length && n >= 4) ? 1 : 0;
  const nSec = Math.min(sec.length, Math.round((n - nAcc) * 0.25));
  const nBase = n - nAcc - nSec;
  const out = [];
  for (let i = 0; i < nBase; i++) out.push(base[i % base.length]);
  for (let i = 0; i < nSec; i++) out.push(sec[i % sec.length]);
  for (let i = 0; i < nAcc; i++) out.push(acc[i % acc.length]);
  return out;
}

// ── 쇼핑 리스트 (05): gap 을 우선순위로. 현재 계절 + 매일필수(INNER) 먼저
function shoppingList(audit) {
  const dailyFirst = { INNER: 0, HOMEWEAR: 1, UNIFORM: 2 };
  const items = [];
  for (const m of audit) {
    for (const r of m.rows) {
      if (r.gap <= 0) continue;
      const isNow = r.bucket === CUR_SEASON || (m.id === 'INNER' && r.bucket === 'allseason');
      items.push({ ...r, module: m.id, moduleName: m.name,
        colors: allocColors(target.modules[m.id].palette, r.gap),
        priority: (isNow ? 0 : 10) + (dailyFirst[m.id] ?? 5) });
    }
  }
  return items.sort((a, b) => a.priority - b.priority);
}

// ── 전역 뷰 (01-design §3.7): 모듈을 걷어내고 전체를 본다
function globalReport(inventory) {
  const active = inventory.filter(g => g.active);

  // colorDistribution: 같은 (역할, 주색상)이 2개+ 모듈에 있으면 중복 경보
  const byRoleColor = {};
  for (const g of active) {
    const key = `${g.role}|${g.colors[0]}`;
    (byRoleColor[key] ??= []).push(g);
  }
  const dupes = Object.entries(byRoleColor)
    .map(([k, gs]) => ({ key: k, gs, modules: new Set(gs.map(g => g.module)) }))
    .filter(x => x.modules.size >= 2);

  // deadstock: 1년+ 미착용 (미착용이면 취득 후 1년+)
  const deadstock = active.filter(g => {
    const idle = g.lastWornAt ? daysSince(g.lastWornAt) : daysSince(g.acquiredAt);
    return idle > 365;
  });

  return { dupes, deadstock, count: active.length };
}

// ── 빌림 히트맵 (01-design §3.6·3.9): forModule 별 빈도
function borrowHeatmap(borrows) {
  const map = {};
  for (const b of borrows) {
    const key = `${b.fromModule}→${b.forModule}`;
    (map[key] ??= { ...b, n: 0 }).n++;
  }
  return Object.values(map).sort((a, b) => b.n - a.n);
}

// ── 활용도 점수 (01-design §3.8)
const CONDITION_W = { NEW: 1, GOOD: 1, WORN: 0.7, DAMAGED: 0.4, RETIRE: 0.1 };
function utilityScore(g) {
  const wearFreq = g.wearCount / monthsOwned(g);
  const idle = g.lastWornAt ? daysSince(g.lastWornAt) : daysSince(g.acquiredAt);
  const recency = Math.exp(-idle / 90);
  return wearFreq * recency * (CONDITION_W[g.condition] ?? 1);
}

// ── 정리 판단 (01-design §3.8): 저활용 + 오래 미착용 → 수선/기부/처분
function cleanupPlan(inventory) {
  const active = inventory.filter(g => g.active);
  const scored = active.map(g => ({ g, score: utilityScore(g),
    idle: g.lastWornAt ? daysSince(g.lastWornAt) : daysSince(g.acquiredAt) }))
    .sort((a, b) => a.score - b.score);
  const candidates = scored.filter(s => s.idle > 365).map(s => {
    let action;
    if (s.g.condition === 'DAMAGED') action = '수선';
    else if (s.g.condition === 'NEW' || s.g.condition === 'GOOD') action = '기부/판매';
    else action = '처분';
    return { ...s, action };
  });
  return { scored, candidates };
}

// ── 리포트 출력 ────────────────────────────────
function bar(owned, tgt, w = 12) {
  const f = tgt ? Math.round((owned / tgt) * w) : 0;
  return '█'.repeat(f) + '░'.repeat(w - f);
}
function run(inventory) {
  const audit = auditModule(inventory);
  const T = audit.reduce((s, m) => s + m.target, 0);
  const O = audit.reduce((s, m) => s + m.owned, 0);

  console.log('\n═══ TIDY 옷장 현황 ═══');
  console.log(`목표 ${T} · 보유 ${O} · 부족 ${T - O} · 채움률 ${Math.round(O / T * 100)}%\n`);

  console.log('── 모듈별 감사 (auditModule) ──');
  for (const m of audit) {
    const warn = m.unmatched.length ? `  ⚠ 미배정 ${m.unmatched.length}` : '';
    console.log(`${m.name.padEnd(7)} ${bar(m.owned, m.target)} ${m.owned}/${m.target}  (부족 ${m.gap})${warn}`);
    m.rows.filter(r => r.flexUsed > 0).forEach(r =>
      console.log(`         ↳ 사철옷 ${r.flexUsed}벌이 ${ROLE_KO[r.role]}·${SEASON_KO[r.bucket]} 칸을 유연 충당 (커버리지 규칙)`));
    m.unmatched.forEach(g => console.log(`         ↳ "${g.name}" (${g.season}) 계절/역할 칸 없음 → 보정 필요`));
  }

  const shop = shoppingList(audit);
  const now = shop.filter(s => s.priority < 10);
  console.log(`\n── 🛒 이번에 살 것 · ${SEASON_KO[CUR_SEASON]}+매일필수 (Phase 1) ──`);
  for (const s of now) {
    console.log(`  ${s.moduleName.padEnd(6)} ${ROLE_KO[s.role].padEnd(4)} ×${s.gap}  [${s.colors.join(', ')}]`);
  }
  const later = shop.filter(s => s.priority >= 10).reduce((a, s) => a + s.gap, 0);
  console.log(`\n  (그 외 다음 Phase 부족분: ${later}벌)`);

  // ── 전역 뷰 ──
  const gr = globalReport(inventory);
  console.log('\n── 🌐 전역 뷰 (globalReport) ──');
  console.log(`중복 가능 (같은 역할·색이 여러 모듈에):`);
  if (!gr.dupes.length) console.log('  없음');
  for (const d of gr.dupes) {
    const [role, color] = d.key.split('|');
    console.log(`  ⚠ ${ROLE_KO[role]}·${color} — ${[...d.modules].join(', ')} (${d.gs.map(g => g.name).join(' / ')})`);
  }
  console.log(`데드스톡 (1년+ 미착용):`);
  if (!gr.deadstock.length) console.log('  없음');
  for (const g of gr.deadstock) {
    const idle = g.lastWornAt ? daysSince(g.lastWornAt) : daysSince(g.acquiredAt);
    console.log(`  · ${g.name} (${g.module}) — ${idle}일 미착용, ${g.condition}`);
  }

  // ── 빌림 히트맵 ──
  const heat = borrowHeatmap(BORROWS);
  console.log('\n── 🔁 빌림 히트맵 (borrowHeatmap) ──');
  for (const h of heat) {
    const flag = h.n >= 3 ? '  ⚠ 전용 옷 추가 검토 (A안 신호)' : '';
    console.log(`  ${h.fromModule}→${h.forModule} ${h.n}회  "${h.garment}"${flag}`);
  }

  // ── 정리 판단 ──
  const cp = cleanupPlan(inventory);
  console.log('\n── 🧹 정리 판단 (utilityScore) ──');
  console.log('활용도 하위 (낮을수록 안 입음):');
  for (const s of cp.scored.slice(0, 4)) {
    console.log(`  ${s.score.toFixed(3)}  ${s.g.name.padEnd(14)} 착용 ${s.g.wearCount}회 · ${s.idle}일 전 · ${s.g.condition}`);
  }
  console.log('정리 후보 (1년+ 미착용):');
  if (!cp.candidates.length) console.log('  없음');
  for (const c of cp.candidates) {
    console.log(`  → [${c.action}] ${c.g.name} (${c.g.condition}, ${c.idle}일 미착용)`);
  }

  // ── 비 대비 커버리지 (날씨 축) ──
  const rr = rainReadiness(inventory);
  console.log('\n── ☔ 비 대비 커버리지 (rainReadiness) ──');
  for (const m of rr) {
    const mark = m.ready ? '✓' : '⚠ 방수 아이템 없음';
    const detail = m.ready ? `(${m.items.map(g => g.name).join(', ')})` : '';
    console.log(`  ${m.name.padEnd(7)} ${mark} ${detail}`);
  }
  console.log('  ↳ 대책: 방수 없는 모듈은 "공용 우천 장비(우산·레인부츠)"로 커버 (신발처럼 모듈 교차 공용)');
}

// ── 데모: 보유 옷 3벌 등록 후 실행 (module-detail 목업과 동일) ──
const inventory = [
  // 유니폼 여름 (자주 착용, 양호)
  register({ name: '화이트 옥스퍼드 셔츠', moduleHint: 'UNIFORM', season: 'SUMMER', condition: 'GOOD', color: '화이트', wearCount: 20, lastWornAt: '2026-07-01', acquiredAt: '2026-01-10' }),
  register({ name: '네이비 셔츠',        moduleHint: 'UNIFORM', season: 'SUMMER', condition: 'NEW',  color: '곤색', wearCount: 2, lastWornAt: '2026-06-28', acquiredAt: '2026-06-01' }),
  register({ name: '그레이 슬랙스',      moduleHint: 'UNIFORM', role: 'BOTTOM', season: 'SUMMER', condition: 'GOOD', color: '그레이', wearCount: 30, lastWornAt: '2026-07-03', acquiredAt: '2025-09-01' }),
  // 운동 검정 반팔 (주말 검정 반팔과 역할·색 중복)
  register({ name: '검정 반팔 티',       moduleHint: 'WORKOUT', season: 'SUMMER', condition: 'GOOD', color: '블랙', wearCount: 40, lastWornAt: '2026-07-04', acquiredAt: '2025-06-01' }),
  register({ name: '검정 무지 티',       moduleHint: 'WEEKEND', season: 'SUMMER', condition: 'GOOD', color: '블랙', wearCount: 5,  lastWornAt: '2026-05-20', acquiredAt: '2025-06-01' }),
  // 데드스톡 (정장, 오래 안 입음)
  register({ name: '남색 정장 셋',       moduleHint: 'SUIT', role: 'SUITSET', season: 'ALL_SEASON', condition: 'GOOD', color: '곤색', wearCount: 1, lastWornAt: '2024-11-01', acquiredAt: '2023-05-01' }),
  // 손상된 등산화 (오래 안 씀 + DAMAGED)
  register({ name: '낡은 등산화',        moduleHint: 'HIKING', role: 'SHOES', season: 'ALL_SEASON', condition: 'DAMAGED', color: '카키', wearCount: 15, lastWornAt: '2024-10-01', acquiredAt: '2021-03-01', weather: ['RAIN'] }),
  // 사철 청바지 (ALL_SEASON) — 커버리지 규칙 시연: 주말 하의 계절 gap을 유연하게 채움
  register({ name: '인디고 청바지',      moduleHint: 'WEEKEND', role: 'BOTTOM', season: 'ALL_SEASON', condition: 'GOOD', color: '곤색', wearCount: 25, lastWornAt: '2026-07-02', acquiredAt: '2025-03-01' }),
];

// 빌림 기록 데모 (INV-4): 운동 검정 반팔을 주말에 자주 빌려 입음
const BORROWS = [
  { garment: '검정 반팔 티', fromModule: 'WORKOUT', forModule: 'WEEKEND' },
  { garment: '검정 반팔 티', fromModule: 'WORKOUT', forModule: 'WEEKEND' },
  { garment: '검정 반팔 티', fromModule: 'WORKOUT', forModule: 'WEEKEND' },
  { garment: '그레이 슬랙스', fromModule: 'UNIFORM', forModule: 'SUIT' },
];

console.log('등록된 옷:', inventory.map(g => `${g.name}→${g.module}/${g.role}/${g.season}/${g.colors}`).join('\n           '));
run(inventory);
