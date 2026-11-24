/* POST /api/mm/ingest   (x-ingest-key == MM_INGEST_KEY)
 * body: { date, sales:[{store,net_sales,pay_cnt}], ads:[{ad_account_name,ad_channel_name,campaign_name,adset_name,keyword,spend_novat,impressions,clicks,conversions,value}] }
 * 같은 date 재전송 시 덮어씀. 광고는 campaign_map(해당 월)으로 서버에서 매핑, 미매칭은 'unmapped'. */
const { sbSelect, sbUpsert, sbDelete, ingestOk, json, readJson, resolveCampaignId, monthOf } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') return json(res, 405, { error: 'method_not_allowed' });
  if (!ingestOk(req)) return json(res, 401, { error: 'bad_ingest_key' });

  // 날짜별 삭제 (재적재/테스트 정리용)
  if (req.method === 'DELETE') {
    const date = String((req.query && req.query.date) || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'date_invalid' });
    try {
      await sbDelete('bb_mm_actual_ads', `date=eq.${date}`);
      await sbDelete('bb_mm_actual_sales', `date=eq.${date}`);
      return json(res, 200, { ok: true, deleted_date: date });
    } catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  }

  try {
    const body = await readJson(req);
    const date = String(body.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'date_invalid' });
    const month = monthOf(date);
    const sales = Array.isArray(body.sales) ? body.sales : [];
    const ads = Array.isArray(body.ads) ? body.ads : [];
    const now = new Date().toISOString();

    let salesN = 0;
    if (sales.length) {
      const rows = sales.map((s) => ({
        date,
        store: String(s.store || ''),
        net_sales: Math.round(Number(s.net_sales || 0)),
        pay_cnt: Math.round(Number(s.pay_cnt || 0)),
        ingested_at: now,
      }));
      await sbUpsert('bb_mm_actual_sales', rows, { onConflict: 'date,store' });
      salesN = rows.length;
    }

    let adsN = 0;
    const unmapped = { spend_novat: 0, count: 0 };
    if (ads.length) {
      const mapRows = await sbSelect('bb_mm_campaign_map', `month=eq.${encodeURIComponent(month)}&select=*`);
      const rows = ads.map((a) => {
        const cid = resolveCampaignId(a, mapRows);
        if (cid === 'unmapped') { unmapped.spend_novat += Number(a.spend_novat || 0); unmapped.count += 1; }
        return {
          date,
          ad_account_name: String(a.ad_account_name || ''),
          ad_channel_name: String(a.ad_channel_name || ''),
          campaign_name: String(a.campaign_name || ''),
          adset_name: String(a.adset_name || ''),
          keyword: String(a.keyword || ''),
          campaign_id: cid,
          spend_novat: Math.round(Number(a.spend_novat || 0)),
          impressions: Math.round(Number(a.impressions || 0)),
          clicks: Math.round(Number(a.clicks || 0)),
          conversions: Number(a.conversions || 0),
          value: Math.round(Number(a.value || 0)),
          ingested_at: now,
        };
      });
      await sbUpsert('bb_mm_actual_ads', rows, {
        onConflict: 'date,ad_account_name,campaign_name,adset_name,keyword',
      });
      adsN = rows.length;
    }

    return json(res, 200, { ok: true, date, month, sales_upserted: salesN, ads_upserted: adsN, unmapped });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
