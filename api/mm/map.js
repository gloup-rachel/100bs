/* /api/mm/map?month=YYYY-MM
 *   GET (team)  : { campaign_map, campaigns } — 현재 매핑표 + 플랜 캠페인 목록(배정 드롭다운용)
 *   PUT (admin) : body { rows:[...] } 로 해당 월 매핑표를 통째로 교체
 *
 * campaign_map pk=(month, campaign_id) → 플랜 캠페인 1개당 매핑 규칙 1행.
 * 1개 플랜에 여러 라플라스 캠페인을 묶으려면 match_type=keyword_in/adset_in/fallback 사용. */
const { sbSelect, sbDelete, sbUpsert, gate, json, readJson } = require('../_lib');

module.exports = async (req, res) => {
  const month = String((req.query && req.query.month) || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return json(res, 400, { error: 'month_invalid' });

  if (req.method === 'GET') {
    const g = gate(req, 'team');
    if (!g.ok) return json(res, 401, { error: 'unauthorized' });
    try {
      const campaign_map = await sbSelect('bb_mm_campaign_map', `month=eq.${month}&select=*&order=campaign_id.asc`);
      const plans = await sbSelect('bb_mm_plans', `month=eq.${month}&select=payload`);
      const payload = plans[0] && plans[0].payload;
      const campaigns = ((payload && payload.campaigns) || []).map((c) => ({
        id: c.id, name: c.name, store: c.store, channel: c.channel, channel_label: c.channel_label,
      }));
      return json(res, 200, { month, campaign_map, campaigns });
    } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  }

  if (req.method === 'PUT') {
    const g = gate(req, 'admin');
    if (!g.ok) return json(res, 401, { error: 'unauthorized' });
    try {
      const body = await readJson(req);
      const rows = Array.isArray(body.rows) ? body.rows : null;
      if (!rows) return json(res, 400, { error: 'rows_required' });
      // campaign_id 기준 dedup (pk 충돌 방지, 마지막 값 우선)
      const byId = {};
      for (const r of rows) {
        const cid = String(r.campaign_id || '').trim();
        if (!cid) continue;
        byId[cid] = {
          month, campaign_id: cid,
          ad_account_name: r.ad_account_name || null,
          ad_channel_name: r.ad_channel_name || null,
          campaign_name: r.campaign_name || null,
          adset_name: r.adset_name || null,
          keyword: r.keyword || null,
          match_type: r.match_type || 'exact',
          status: r.status || 'confirmed',
          note: r.note || '',
        };
      }
      const clean = Object.values(byId);
      await sbDelete('bb_mm_campaign_map', `month=eq.${month}`);
      if (clean.length) await sbUpsert('bb_mm_campaign_map', clean, { onConflict: 'month,campaign_id' });
      return json(res, 200, { ok: true, month, rows: clean.length });
    } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  }

  return json(res, 405, { error: 'method_not_allowed' });
};
