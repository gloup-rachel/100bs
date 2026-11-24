/* GET /api/mm/actuals?month=YYYY-MM  (team)
 * 반환: 일별 매출(sales), campaign_id별 일별 광고 합계(ads), unmapped 합계, as_of */
const { sbSelect, gate, json } = require('../_lib');

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
    const sales = await sbSelect(
      'bb_mm_actual_sales',
      `date=gte.${start}&date=lt.${end}&select=date,store,net_sales,pay_cnt&order=date.asc`
    );
    const adRows = await sbSelect(
      'bb_mm_actual_ads',
      `date=gte.${start}&date=lt.${end}&select=date,campaign_id,ad_account_name,spend_novat,impressions,clicks,conversions,value,ingested_at`
    );

    const byKey = {};
    let asOf = null; // 최신 데이터 날짜(D-1 적재분). 적재 시각(ingested_at)이 아님
    const unmapped = { spend_novat: 0, impressions: 0, clicks: 0, conversions: 0, value: 0, rows: 0 };

    for (const s of sales) { if (s.date && (!asOf || s.date > asOf)) asOf = s.date; }

    for (const r of adRows) {
      if (r.date && (!asOf || r.date > asOf)) asOf = r.date;
      const cid = r.campaign_id || 'unmapped';
      const k = cid + '|' + r.date;
      const o = byKey[k] || (byKey[k] = {
        campaign_id: cid, date: r.date,
        spend_novat: 0, impressions: 0, clicks: 0, conversions: 0, value: 0,
      });
      o.spend_novat += Number(r.spend_novat || 0);
      o.impressions += Number(r.impressions || 0);
      o.clicks += Number(r.clicks || 0);
      o.conversions += Number(r.conversions || 0);
      o.value += Number(r.value || 0);
      if (cid === 'unmapped') {
        unmapped.spend_novat += Number(r.spend_novat || 0);
        unmapped.impressions += Number(r.impressions || 0);
        unmapped.clicks += Number(r.clicks || 0);
        unmapped.conversions += Number(r.conversions || 0);
        unmapped.value += Number(r.value || 0);
        unmapped.rows += 1;
      }
    }

    return json(res, 200, { month, as_of: asOf, sales, ads: Object.values(byKey), unmapped });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
