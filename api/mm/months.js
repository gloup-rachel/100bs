/* GET /api/mm/months  (team)
 * bb_mm_plans 의 month 목록을 내림차순으로 반환. 새 plan 이 들어오면 자동으로 나타난다. */
const { sbSelect, gate, json } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const g = gate(req, 'team');
  if (!g.ok) return json(res, 401, { error: 'unauthorized' });
  try {
    const rows = await sbSelect('bb_mm_plans', 'select=month,version,approved,updated_at&order=month.desc');
    return json(res, 200, { months: rows.map((r) => r.month), items: rows });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
};
