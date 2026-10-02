/* 미디어믹스 v8.1 공통 유틸: Supabase(PostgREST) 접근 + 인증 (외부 패키지 없이 fetch만)
 *
 * 트래커 api/_lib.js 의 인증/PostgREST 방식을 재사용하되, 관계형 테이블용 헬퍼로 확장했다.
 * 저장소는 미디어믹스 전용 Supabase 프로젝트를 쓴다 (트래커 bb_tracker_kv / Upstash 와는 별개).
 *
 * 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MM_INGEST_KEY
 *   (ADMIN_PW / TEAM_PW 는 선택 — 있으면 게이트가 자동으로 켜진다)
 */

/* ---------- Supabase 환경/헤더 ---------- */
function sbEnv() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_ENV_MISSING');
  return { url, key };
}
function sbHeaders(extra) {
  const { key } = sbEnv();
  return Object.assign({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }, extra || {});
}

/* ---------- PostgREST 헬퍼 ---------- */
async function sbSelect(table, qs) {
  const { url } = sbEnv();
  const q = qs ? ('?' + qs) : '';
  const r = await fetch(`${url}/rest/v1/${table}${q}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`SUPABASE_SELECT_${table}_${r.status}_${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function sbUpsert(table, rows, opts) {
  // opts: { onConflict: 'col,col', returning: 'minimal'|'representation' }
  const { url } = sbEnv();
  const oc = opts && opts.onConflict ? `?on_conflict=${encodeURIComponent(opts.onConflict)}` : '';
  const prefer = ['resolution=merge-duplicates', 'return=' + ((opts && opts.returning) || 'minimal')].join(',');
  const r = await fetch(`${url}/rest/v1/${table}${oc}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: prefer }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!r.ok) throw new Error(`SUPABASE_UPSERT_${table}_${r.status}_${(await r.text()).slice(0, 160)}`);
  return (opts && opts.returning === 'representation') ? r.json() : true;
}
async function sbInsert(table, rows) {
  const { url } = sbEnv();
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!r.ok) throw new Error(`SUPABASE_INSERT_${table}_${r.status}_${(await r.text()).slice(0, 160)}`);
  return true;
}
async function sbDelete(table, qs) {
  const { url } = sbEnv();
  const r = await fetch(`${url}/rest/v1/${table}?${qs}`, {
    method: 'DELETE',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
  });
  if (!r.ok) throw new Error(`SUPABASE_DELETE_${table}_${r.status}_${(await r.text()).slice(0, 160)}`);
  return true;
}

/* ---------- 인증 ---------- */
/* 'admin' | 'team' | null. 헤더는 ISO-8859-1만 담기므로 클라이언트가 encodeURIComponent 로 보낸다 */
function roleOf(req) {
  let pw = req.headers['x-bb-pw'] || '';
  try { pw = decodeURIComponent(pw); } catch (e) { /* 이미 평문이면 그대로 */ }
  const admin = process.env.ADMIN_PW || '';
  const team = process.env.TEAM_PW || '';
  if (admin && pw === admin) return 'admin';
  if (team && pw === team) return 'team';
  return null;
}
/* 소프트 게이트: 해당 PW env 가 설정돼 있지 않으면 개방(open). 설정되면 자동으로 강제된다. */
function gate(req, need) {
  const adminSet = !!process.env.ADMIN_PW;
  const teamSet = !!process.env.TEAM_PW;
  const role = roleOf(req);
  if (need === 'admin') {
    if (!adminSet) return { ok: true, role: 'open' };
    return role === 'admin' ? { ok: true, role } : { ok: false, role };
  }
  // need === 'team' (admin 도 통과). 로그인 게이트(mm-gate.js)가 x-bb-pw 를 보낸다.
  if (!teamSet && !adminSet) return { ok: true, role: 'open' };
  return (role === 'admin' || role === 'team') ? { ok: true, role } : { ok: false, role };
}
function ingestOk(req) {
  const want = process.env.MM_INGEST_KEY || '';
  let got = req.headers['x-ingest-key'] || '';
  try { got = decodeURIComponent(got); } catch (e) { /* 평문 */ }
  return !!want && got === want;
}

/* ---------- HTTP ---------- */
function json(res, code, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(body));
}
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

/* ---------- 도메인 규칙 ---------- */
function monthOf(dateStr) { return String(dateStr || '').slice(0, 7); }

/* 스토어 분류 (HANDOFF §1, 검증 R16): ad_account_name 기준. 캠페인명 접두사 사용 금지 */
function storeOfAccount(accName) {
  const a = String(accName == null ? '' : accName);
  if (a === '캠핑밀키트 백년밥상') return 'own';        // 메타 (자사몰)
  if (a === '백년밥상_협력광고(NAVER)') return 'naver'; // 메타 (CBT)
  if (a === 'pym12') return 'naver';                    // 쇼핑검색/파워링크/브랜드검색
  if (a === '백년밥상 ') return 'naver';                // 끝 공백 1칸 = GFA
  // 안전망: 앞뒤 공백만 다른 경우
  const t = a.trim();
  if (t === '캠핑밀키트 백년밥상') return 'own';
  if (t === '백년밥상_협력광고(NAVER)' || t === 'pym12' || t === '백년밥상') return 'naver';
  return null; // 미분류
}

/* 매핑 (HANDOFF §5)
 * 우선순위: keyword_in > adset_in > exact(campaign+adset) > exact(campaign) > fallback
 * budget_only 는 매핑 대상이 아님. 미매칭은 'unmapped'.
 */
function resolveCampaignId(ad, mapRows) {
  const acc = String(ad.ad_account_name || '');
  const chan = String(ad.ad_channel_name || '');
  const camp = String(ad.campaign_name || '');
  const adset = String(ad.adset_name || '');
  const kw = String(ad.keyword || '');
  const sameAcct = (m) => !m.ad_account_name || m.ad_account_name === acc;
  const sameChan = (m) => !m.ad_channel_name || m.ad_channel_name === chan;
  const scoped = mapRows.filter((m) => m.status !== 'budget_only' && sameAcct(m) && sameChan(m));

  let hit = scoped.find((m) => m.match_type === 'keyword_in' && m.keyword && kw && kw.indexOf(m.keyword) !== -1);
  if (hit) return hit.campaign_id;
  hit = scoped.find((m) => m.match_type === 'adset_in' && m.adset_name && adset && adset.indexOf(m.adset_name) !== -1);
  if (hit) return hit.campaign_id;
  hit = scoped.find((m) => m.match_type === 'exact' && m.campaign_name === camp && (m.adset_name || '') !== '' && (m.adset_name || '') === adset);
  if (hit) return hit.campaign_id;
  hit = scoped.find((m) => m.match_type === 'exact' && m.campaign_name === camp);
  if (hit) return hit.campaign_id;
  // campaign_list: keyword 에 '|' 로 구분된 캠페인명 목록 중 정확히 일치 (신규 버킷 다수 수용)
  hit = scoped.find((m) => m.match_type === 'campaign_list' && m.keyword && camp
    && m.keyword.split('|').map((s) => s.trim()).filter(Boolean).indexOf(camp) !== -1);
  if (hit) return hit.campaign_id;
  hit = scoped.find((m) => m.match_type === 'campaign_in' && m.campaign_name && camp && camp.indexOf(m.campaign_name) !== -1);
  if (hit) return hit.campaign_id;
  hit = scoped.find((m) => m.match_type === 'fallback');
  if (hit) return hit.campaign_id;
  return 'unmapped';
}

module.exports = {
  sbSelect, sbUpsert, sbInsert, sbDelete,
  roleOf, gate, ingestOk,
  json, readJson,
  monthOf, storeOfAccount, resolveCampaignId,
};
