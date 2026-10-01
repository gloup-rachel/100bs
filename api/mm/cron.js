/* GET /api/mm/cron  — 라플라스 D-3~D-1 자동 적재 (Vercel Cron 매일 실행)
 *   인증: x-ingest-key(MM_INGEST_KEY) 또는 Authorization: Bearer <CRON_SECRET>
 *   백필: ?start=YYYY-MM-DD&end=YYYY-MM-DD (기본 = 그그제~어제, KST)
 *
 * 규칙(확정):
 *   - 스토어: channel_name CAFE_24→own, SMARTSTORE→naver
 *   - 순매출: own = sales − delivery_fee − used_reward / naver = sales(결제금액)
 *   - 결제건수: count_distinct(order_id)
 *   - 광고: spend(=VAT제외), 전환=action_cnt, 전환매출=action_value (CBT 계정만 shared_purchase_action_value)
 *   - 스토어 분류 안 되는 광고 계정(farmtt 등)은 제외
 *   - 매핑은 campaign_map(해당 월)으로 서버 수행, 미매칭 unmapped
 *
 * 라플라스 응답이 커서(content budget) 하루 단위로 조회하고, keyword 차원은 제외(캠페인+광고그룹 단위).
 */
const { queryRecords, AGG } = require('../_laplace');
const { sbSelect, sbUpsert, sbDelete, storeOfAccount, resolveCampaignId, monthOf, json } = require('../_lib');

const CBT_ACCOUNT = '백년밥상_협력광고(NAVER)';

function authed(req) {
  let got = req.headers['x-ingest-key'] || '';
  try { got = decodeURIComponent(got); } catch (e) { /* plain */ }
  if (process.env.MM_INGEST_KEY && got === process.env.MM_INGEST_KEY) return true;
  const cs = process.env.CRON_SECRET || '';
  return !!cs && (req.headers['authorization'] || '') === ('Bearer ' + cs);
}

function kstToday() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function num(x) { return Math.round(Number(x || 0)); }
function datesInRange(s, e) { const out = []; for (let d = s; d <= e; d = addDays(d, 1)) out.push(d); return out; }
function dayFilter(date) { return { type: 'fixed', start_datetime_id: date + 'T00:00:00.000', end_datetime_id: date + 'T23:59:59.999', tz: 'kst' }; }

async function pullAds(date) {
  return queryRecords('commerce_ad', {
    freq: 'day', date_filters: dayFilter(date),
    dimensions: [{ name: 'ad_account_name' }, { name: 'ad_channel_name' }, { name: 'campaign_name' }, { name: 'adset_name' }],
    measures: [AGG('spend'), AGG('impressions'), AGG('clicks'), AGG('action_cnt'), AGG('action_value'), AGG('shared_purchase_action_value')],
  });
}
async function pullSales(date) {
  return queryRecords('commerce_order', {
    freq: 'day', date_filters: dayFilter(date),
    dimensions: [{ name: 'channel_name' }],
    measures: [AGG('sales'), AGG('delivery_fee'), AGG('used_reward'), AGG('pay_cnt', { col: 'order_id', f: 'count_distinct' })],
  });
}

module.exports = async (req, res) => {
  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
  const q = req.query || {};
  const today = kstToday();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(q.start || '') ? q.start : addDays(today, -3);
  const end = /^\d{4}-\d{2}-\d{2}$/.test(q.end || '') ? q.end : addDays(today, -1);
  if (start > end) return json(res, 400, { error: 'range_invalid', start, end });

  const mapCache = {};
  const mapFor = async (m) => { if (!mapCache[m]) mapCache[m] = await sbSelect('bb_mm_campaign_map', `month=eq.${encodeURIComponent(m)}&select=*`); return mapCache[m]; };

  try {
    const summary = [];
    for (const date of datesInRange(start, end)) {
      const month = monthOf(date);
      const mapRows = await mapFor(month);
      const now = new Date().toISOString();

      // --- 매출 ---
      const orderRows = await pullSales(date);
      const salesRows = [];
      for (const r of orderRows) {
        const store = r.channel_name === 'CAFE_24' ? 'own' : (r.channel_name === 'SMARTSTORE' ? 'naver' : null);
        if (!store) continue;
        const net = store === 'own' ? (num(r.sales) - num(r.delivery_fee) - num(r.used_reward)) : num(r.sales);
        salesRows.push({ date, store, net_sales: net, pay_cnt: num(r.pay_cnt), ingested_at: now });
      }

      // --- 광고 ---
      const adRows = await pullAds(date);
      const adOut = [];
      const unmapped = { spend_novat: 0, count: 0 };
      for (const r of adRows) {
        const acc = r.ad_account_name;
        if (storeOfAccount(acc) === null) continue; // 우리 매체 계정만
        const ad = {
          ad_account_name: acc, ad_channel_name: r.ad_channel_name || '',
          campaign_name: r.campaign_name || '', adset_name: r.adset_name || '', keyword: '',
        };
        const cid = resolveCampaignId(ad, mapRows);
        const value = acc === CBT_ACCOUNT ? num(r.shared_purchase_action_value) : num(r.action_value);
        if (cid === 'unmapped') { unmapped.spend_novat += num(r.spend); unmapped.count += 1; }
        adOut.push({
          date, ad_account_name: acc, ad_channel_name: ad.ad_channel_name,
          campaign_name: ad.campaign_name, adset_name: ad.adset_name, keyword: '',
          campaign_id: cid,
          spend_novat: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks),
          conversions: Number(r.action_cnt || 0), value, ingested_at: now,
        });
      }

      // --- 적재 (해당 날짜 재적재: 삭제 후 삽입) ---
      await sbDelete('bb_mm_actual_ads', `date=eq.${date}`);
      await sbDelete('bb_mm_actual_sales', `date=eq.${date}`);
      if (salesRows.length) await sbUpsert('bb_mm_actual_sales', salesRows, { onConflict: 'date,store' });
      if (adOut.length) await sbUpsert('bb_mm_actual_ads', adOut, { onConflict: 'date,ad_account_name,campaign_name,adset_name,keyword' });

      summary.push({ date, sales_upserted: salesRows.length, ads_upserted: adOut.length, unmapped });
    }

    return json(res, 200, { ok: true, range: { start, end }, dates: summary });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e.message || e) });
  }
};
