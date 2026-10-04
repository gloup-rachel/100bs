/* /api/mm/plan?month=YYYY-MM
 *   GET (team)  : payload + campaign_map 반환
 *   PUT (admin) : payload 교체, 이전 값은 bb_mm_plan_history 로 보관, version 필수 */
const { sbSelect, sbUpsert, sbInsert, gate, json, readJson } = require('../_lib');

module.exports = async (req, res) => {
  const month = String((req.query && req.query.month) || '').trim();

  if (req.method === 'GET') {
    const g = gate(req, 'team');
    if (!g.ok) return json(res, 401, { error: 'unauthorized' });
    if (!month) return json(res, 400, { error: 'month_required' });
    try {
      const plans = await sbSelect(
        'bb_mm_plans',
        `month=eq.${encodeURIComponent(month)}&select=month,version,approved,payload,updated_at`
      );
      if (!plans.length) return json(res, 404, { error: 'plan_not_found', month });
      const map = await sbSelect(
        'bb_mm_campaign_map',
        `month=eq.${encodeURIComponent(month)}&select=*&order=campaign_id.asc`
      );
      const p = plans[0];
      return json(res, 200, {
        month: p.month, version: p.version, approved: p.approved,
        updated_at: p.updated_at, payload: p.payload, campaign_map: map,
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (req.method === 'PUT') {
    const g = gate(req, 'admin');
    if (!g.ok) return json(res, 401, { error: 'unauthorized' });
    if (!month) return json(res, 400, { error: 'month_required' });
    try {
      const body = await readJson(req);
      if (!body || !body.version) return json(res, 400, { error: 'version_required' });
      if (!body.payload || typeof body.payload !== 'object') return json(res, 400, { error: 'payload_required' });
      const prev = await sbSelect(
        'bb_mm_plans',
        `month=eq.${encodeURIComponent(month)}&select=month,version,payload`
      );
      // 스토어별 예산 총액 잠금 (제로섬 강제) — 바뀌면 force 없이는 거부
      if (prev.length && !body.force) {
        const sums = (pl) => {
          const o = {};
          ((pl && pl.campaigns) || []).forEach((c) => { o[c.store] = (o[c.store] || 0) + Number(c.budget || 0); });
          return o;
        };
        const a = sums(prev[0].payload), b = sums(body.payload);
        const deltas = {};
        for (const s of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const d = (b[s] || 0) - (a[s] || 0);
          if (d !== 0) deltas[s] = d;
        }
        if (Object.keys(deltas).length) {
          return json(res, 409, { error: 'budget_total_changed', deltas, hint: '스토어별 예산 총액이 직전과 다릅니다. 제로섬으로 맞추거나 force:true 로 저장하세요.' });
        }
      }
      if (prev.length) {
        await sbInsert('bb_mm_plan_history', {
          month: prev[0].month, version: prev[0].version, payload: prev[0].payload,
        });
      }
      await sbUpsert('bb_mm_plans', {
        month,
        version: String(body.version),
        approved: body.approved || null,
        payload: body.payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'month' });
      return json(res, 200, { ok: true, month, version: String(body.version), history_saved: prev.length > 0 });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  return json(res, 405, { error: 'method_not_allowed' });
};
