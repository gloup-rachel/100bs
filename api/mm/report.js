/* /api/mm/report?month=YYYY-MM
 *   GET (team)  : { month, html, updated_at }
 *   PUT (admin) : html 교체 */
const { sbSelect, sbUpsert, gate, json, readJson } = require('../_lib');

module.exports = async (req, res) => {
  const month = String((req.query && req.query.month) || '').trim();

  if (req.method === 'GET') {
    const g = gate(req, 'team');
    if (!g.ok) return json(res, 401, { error: 'unauthorized' });
    if (!month) return json(res, 400, { error: 'month_required' });
    try {
      const rows = await sbSelect('bb_mm_reports', `month=eq.${encodeURIComponent(month)}&select=month,html,updated_at`);
      if (!rows.length) return json(res, 404, { error: 'report_not_found', month });
      return json(res, 200, rows[0]);
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
      if (typeof body.html !== 'string') return json(res, 400, { error: 'html_required' });
      await sbUpsert('bb_mm_reports', { month, html: body.html, updated_at: new Date().toISOString() }, { onConflict: 'month' });
      return json(res, 200, { ok: true, month, bytes: body.html.length });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  return json(res, 405, { error: 'method_not_allowed' });
};
