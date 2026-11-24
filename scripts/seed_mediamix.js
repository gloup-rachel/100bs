#!/usr/bin/env node
/* 미디어믹스 v8.1 시드 (1회용)
 *   data/plan_{MONTH}.json         -> bb_mm_plans
 *   data/campaign_map_{MONTH}.json -> bb_mm_campaign_map
 *
 * 적재 전 HANDOFF §8 검증 규칙 R5, R9, R10, R12, R13, R15 를 plan 기준으로 계산한다.
 * 하나라도 FAIL 이면 적재하지 않고 어느 규칙이 깨졌는지만 보고한다.
 *
 * 사용:
 *   node scripts/seed_mediamix.js [YYYY-MM]
 *   # 실제 적재는 Supabase env 필요:
 *   #   vercel env pull .env.local   (프로젝트: 100bs)
 *   #   node scripts/seed_mediamix.js 2026-10
 *   # env 가 없으면 검증만 하고 적재는 건너뛴다.
 */

const fs = require('fs');
const path = require('path');

const MONTH = (process.argv[2] || '2026-10').trim();
const REPO = path.join(__dirname, '..');

/* ---------- .env.local 로더 (외부 패키지 없이) ---------- */
(function loadDotenv() {
  const f = path.join(REPO, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
})();

/* ---------- 데이터 로드 ---------- */
function findDataDir() {
  const cands = [
    process.env.MM_DATA_DIR,
    path.join(REPO, 'docs/mediamix_v8.1_handoff/data'),
    path.join(process.env.HOME || '', 'Downloads/mediamix_v8.1_handoff/data'),
  ].filter(Boolean);
  for (const d of cands) if (fs.existsSync(path.join(d, `plan_${MONTH}.json`))) return d;
  throw new Error('DATA_DIR_NOT_FOUND: plan_' + MONTH + '.json 을 찾을 수 없음. 후보=' + cands.join(', '));
}
const DATA = findDataDir();
const plan = JSON.parse(fs.readFileSync(path.join(DATA, `plan_${MONTH}.json`), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(DATA, `campaign_map_${MONTH}.json`), 'utf8'));
const mapRows = Array.isArray(map) ? map : (map.rows || map.campaign_map || []);

/* ---------- 검증 ---------- */
const results = [];
function add(rule, status, detail) { results.push({ rule, status, detail }); }
const won = (n) => Math.round(n).toLocaleString('en-US');

// R5: Σ weekday_index[store] == 7.000 ± 0.005
(function R5() {
  const bad = [];
  for (const s of Object.keys(plan.stores || {})) {
    const wi = plan.stores[s].weekday_index || {};
    const sum = Object.values(wi).reduce((a, b) => a + Number(b), 0);
    if (Math.abs(sum - 7) > 0.005) bad.push(`${s}=${sum.toFixed(4)}`);
  }
  bad.length ? add('R5', 'FAIL', `Σweekday_index≠7.000±0.005: ${bad.join(', ')}`)
             : add('R5', 'PASS', 'store별 Σweekday_index = 7.000±0.005');
})();

// R9: Σ(budget×target_roas) (비조건부, 네이버) == (target_sales − 비광고 증분) × attribution_rate
// 비광고 증분 값이 plan 계약에 없으므로 엄밀 판정 불가 -> SKIP (계산값 표기)
(function R9() {
  const nv = plan.stores.naver || {};
  let lhs = 0;
  for (const c of plan.campaigns || []) if (c.store === 'naver' && !c.conditional) lhs += c.budget * c.target_roas;
  const attr = Number(nv.attribution_rate || 0);
  const nonAd = nv.non_ad_incremental != null ? Number(nv.non_ad_incremental) : null;
  if (nonAd == null || !attr) {
    const implied = attr ? (nv.target_sales - lhs / attr) : null;
    add('R9', 'SKIP', `비광고 증분 미제공. LHS Σ(budget×roas)=${won(lhs)}, attr=${attr}, ` +
      `RHS성립 위한 비광고증분=${implied != null ? won(implied) : 'N/A'} (target_sales=${won(nv.target_sales)})`);
    return;
  }
  const rhs = (nv.target_sales - nonAd) * attr;
  const diff = Math.abs(lhs - rhs);
  const tol = Math.max(1000, rhs * 0.005);
  diff <= tol ? add('R9', 'PASS', `LHS=${won(lhs)} ≈ RHS=${won(rhs)} (diff ${won(diff)} ≤ ${won(tol)})`)
              : add('R9', 'FAIL', `LHS=${won(lhs)} ≠ RHS=${won(rhs)} (diff ${won(diff)} > ${won(tol)})`);
})();

// R10: Σ stores 예산 == 총예산 (store 무결성: 모든 campaign.store ∈ plan.stores, 합계 일치)
(function R10() {
  const known = new Set(Object.keys(plan.stores || {}));
  const byStore = {};
  let grand = 0;
  const orphan = new Set();
  for (const c of plan.campaigns || []) {
    byStore[c.store] = (byStore[c.store] || 0) + Number(c.budget || 0);
    grand += Number(c.budget || 0);
    if (!known.has(c.store)) orphan.add(c.store);
  }
  const sumStores = Object.values(byStore).reduce((a, b) => a + b, 0);
  const brk = Object.entries(byStore).map(([k, v]) => `${k}=${won(v)}`).join(', ');
  if (orphan.size) add('R10', 'FAIL', `stores 에 없는 store: ${[...orphan].join(', ')} (${brk})`);
  else if (sumStores !== grand) add('R10', 'FAIL', `Σstores=${won(sumStores)} ≠ 총예산=${won(grand)}`);
  else add('R10', 'PASS', `Σstores=총예산=${won(grand)} (${brk})`);
})();

// R12: 캠페인별 Σ daily_budget == budget (±31원)
(function R12() {
  const bad = [];
  let checked = 0;
  for (const c of plan.campaigns || []) {
    if (!Array.isArray(c.daily_budget)) continue;
    checked++;
    const sum = c.daily_budget.reduce((a, b) => a + Number(b || 0), 0);
    if (Math.abs(sum - Number(c.budget || 0)) > 31) bad.push(`${c.id}: Σ${won(sum)}≠budget${won(c.budget)}`);
  }
  bad.length ? add('R12', 'FAIL', `${bad.length}건: ${bad.join(' | ')}`)
             : add('R12', 'PASS', `${checked}개 캠페인 Σdaily_budget=budget (±31)`);
})();

// R13: 스토어별 Σ daily_target == target_sales (±31원)
(function R13() {
  const bad = [];
  for (const s of Object.keys(plan.stores || {})) {
    const dt = plan.stores[s].daily_target || [];
    const sum = dt.reduce((a, b) => a + Number(b || 0), 0);
    if (Math.abs(sum - Number(plan.stores[s].target_sales || 0)) > 31) {
      bad.push(`${s}: Σ${won(sum)}≠target${won(plan.stores[s].target_sales)}`);
    }
  }
  bad.length ? add('R13', 'FAIL', bad.join(' | '))
             : add('R13', 'PASS', 'store별 Σdaily_target=target_sales (±31)');
})();

// R15: schedule.days == len(schedule.dates)
(function R15() {
  const bad = [];
  let checked = 0;
  for (const c of plan.campaigns || []) {
    const sc = c.schedule;
    if (!sc || !Array.isArray(sc.dates)) continue;
    checked++;
    if (Number(sc.days) !== sc.dates.length) bad.push(`${c.id}: days=${sc.days}≠dates=${sc.dates.length}`);
  }
  bad.length ? add('R15', 'FAIL', bad.join(' | '))
             : add('R15', 'PASS', `${checked}개 캠페인 schedule.days=len(dates)`);
})();

/* ---------- 결과 출력 ---------- */
console.log(`\n미디어믹스 시드 검증 — ${MONTH} (plan ${plan.version}, campaigns ${(plan.campaigns || []).length}, map ${mapRows.length})`);
console.log('데이터: ' + DATA);
console.log('─'.repeat(72));
for (const r of results) {
  const tag = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'SKIP';
  console.log(`${tag}  ${r.rule.padEnd(4)} ${r.detail}`);
}
console.log('─'.repeat(72));
const fails = results.filter((r) => r.status === 'FAIL');
const skips = results.filter((r) => r.status === 'SKIP');
console.log(`PASS ${results.filter((r) => r.status === 'PASS').length} · FAIL ${fails.length} · SKIP ${skips.length}`);

if (fails.length) {
  console.log(`\n중단: ${fails.map((r) => r.rule).join(', ')} 실패 → 적재하지 않음.`);
  process.exit(1);
}

/* ---------- 적재 ---------- */
const hasEnv = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));
if (!hasEnv) {
  console.log('\nSUPABASE env 없음 → 검증만 수행, 적재 생략.');
  console.log('적재하려면: vercel env pull .env.local (프로젝트 100bs) 후 다시 실행.');
  if (skips.length) console.log(`참고: SKIP ${skips.map((r) => r.rule).join(', ')} (적재는 막지 않음).`);
  process.exit(0);
}

(async function load() {
  const { sbUpsert } = require(path.join(REPO, 'api/_lib.js'));
  console.log('\n적재 시작...');
  await sbUpsert('bb_mm_plans', {
    month: plan.month || MONTH,
    version: plan.version,
    approved: plan.approved || null,
    payload: plan,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'month' });
  console.log(`  bb_mm_plans ← ${MONTH} (${plan.version})`);

  const rows = mapRows.map((r) => ({
    month: r.month || MONTH,
    campaign_id: r.campaign_id,
    ad_account_name: r.ad_account_name,
    ad_channel_name: r.ad_channel_name,
    campaign_name: r.campaign_name,
    adset_name: r.adset_name,
    keyword: r.keyword,
    match_type: r.match_type,
    status: r.status,
    note: r.note || '',
  }));
  await sbUpsert('bb_mm_campaign_map', rows, { onConflict: 'month,campaign_id' });
  console.log(`  bb_mm_campaign_map ← ${rows.length} rows`);
  console.log('\n완료.');
  if (skips.length) console.log(`참고: SKIP ${skips.map((r) => r.rule).join(', ')}.`);
})().catch((e) => { console.error('\n적재 실패:', e.message || e); process.exit(2); });
