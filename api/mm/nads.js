/* GET /api/mm/nads  (team)
 * 네이버 광고 시스템 스냅샷(판정·조치) 반환. 손익·마진 데이터 보호 위해 게이트 적용.
 * 데이터는 번들된 nads.data.json (주 1회 시트 동기화로 갱신 후 재배포). */
const { gate, json } = require('../_lib');
const data = require('./nads.data.json');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const g = gate(req, 'team');
  if (!g.ok) return json(res, 401, { error: 'unauthorized' });
  return json(res, 200, data);
};
