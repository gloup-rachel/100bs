/* GET /api/mm/unmapped?month=YYYY-MM  (team)
 * 해당 월 bb_mm_actual_ads 중 campaign_id='unmapped' 를 라플라스 캠페인 단위로 집계해 반환.
 * 매핑 체크 페이지에서 "무엇이 안 잡혔나"를 광고비 순으로 본다. */
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
      `campaign_id=eq.unmapped&date=gte.${start}&date=lt.${end}&select=ad_account_name,ad_channel_name,campaign_name,adset_name,keyword,spend_novat,value,date`
    );
    const agg = {};
    for (const r of rows) {
      const k = [r.ad_account_name, r.ad_channel_name, r.campaign_name, r.adset_name, r.keyword].join('\u0001');
      const o = agg[k] || (agg[k] = {
        ad_account_name: r.ad_account_name, ad_channel_name: r.ad_channel_name,
        campaign_name: r.campaign_name, adset_name: r.adset_name, keyword: r.keyword,
        store: storeOfAccount(r.ad_account_name), spend: 0, value: 0, days: {},
      });
      o.spend += Number(r.spend_novat || 0);
      o.value += Number(r.value || 0);
      o.days[r.date] = 1;
    }
    const items = Object.values(agg).map((o) => ({
      ad_account_name: o.ad_account_name, ad_channel_name: o.ad_channel_name,
      campaign_name: o.campaign_name, adset_name: o.adset_name, keyword: o.keyword,
      store: o.store, spend: o.spend, value: o.value, days: Object.keys(o.days).length,
    })).sort((a, b) => b.spend - a.spend);

    return json(res, 200, { month, count: items.length, total_spend: items.reduce((s, x) => s + x.spend, 0), items });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
