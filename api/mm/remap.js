/* POST /api/mm/remap?month=YYYY-MM  (admin 또는 x-ingest-key)
 * 저장된 bb_mm_actual_ads(해당 월)에 현재 campaign_map 을 다시 적용한다.
 * 라플라스 재조회 없이 campaign_id 만 재계산 → 매핑표 수정 즉시 반영. */
const { sbSelect, sbUpsert, resolveCampaignId, gate, ingestOk, json } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const g = gate(req, 'admin');
  if (!g.ok && !ingestOk(req)) return json(res, 401, { error: 'unauthorized' });

  const month = String((req.query && req.query.month) || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return json(res, 400, { error: 'month_invalid' });
  const start = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const end = (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`) + '-01';

  try {
    const mapRows = await sbSelect('bb_mm_campaign_map', `month=eq.${month}&select=*`);
    const adRows = await sbSelect('bb_mm_actual_ads', `date=gte.${start}&date=lt.${end}&select=*`);
    const updates = [];
    let unmapped = 0;
    for (const r of adRows) {
      const cid = resolveCampaignId({
        ad_account_name: r.ad_account_name, ad_channel_name: r.ad_channel_name,
        campaign_name: r.campaign_name, adset_name: r.adset_name, keyword: r.keyword,
      }, mapRows);
      if (cid === 'unmapped') unmapped++;
      if (cid !== r.campaign_id) updates.push(Object.assign({}, r, { campaign_id: cid }));
    }
    if (updates.length) {
      await sbUpsert('bb_mm_actual_ads', updates, { onConflict: 'date,ad_account_name,campaign_name,adset_name,keyword' });
    }
    return json(res, 200, { ok: true, month, total: adRows.length, changed: updates.length, still_unmapped: unmapped });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
