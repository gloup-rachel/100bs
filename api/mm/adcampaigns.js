/* GET /api/mm/adcampaigns?month=YYYY-MM  (team)
 * 해당 월 bb_mm_actual_ads 를 라플라스 캠페인 단위로 집계 + 현재 campaign_id(버킷) 표기.
 * 매핑 페이지에서 "(기존)단품에 묶인 캠페인"을 보고 신규로 분리할 때 사용. */
const { sbSelect, gate, json, storeOfAccount } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const g = gate(req, 'team');
  if (!g.ok) return json(res, 401, { error: 'unauthorized' });
  const month = String((req.query && req.query.month) || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return json(res, 400, { error: 'month_invalid' });

  const start = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const end = (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`) + '-01';

  try {
    const rows = await sbSelect(
      'bb_mm_actual_ads',
      `date=gte.${start}&date=lt.${end}&select=ad_account_name,ad_channel_name,campaign_name,adset_name,campaign_id,spend_novat`
    );
    const agg = {};
    for (const r of rows) {
      const k = [r.ad_account_name, r.ad_channel_name, r.campaign_name, r.adset_name, r.campaign_id].join('\u0001');
      const o = agg[k] || (agg[k] = {
        ad_account_name: r.ad_account_name, ad_channel_name: r.ad_channel_name,
        campaign_name: r.campaign_name, adset_name: r.adset_name, campaign_id: r.campaign_id,
        store: storeOfAccount(r.ad_account_name), spend: 0,
      });
      o.spend += Number(r.spend_novat || 0);
    }
    const items = Object.values(agg).sort((a, b) => b.spend - a.spend);
    return json(res, 200, { month, count: items.length, items });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
