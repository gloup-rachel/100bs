/* 라플라스 MCP 클라이언트 (streamable HTTP JSON-RPC)
 * 라플라스는 REST API가 없고 MCP 서버로만 접근한다 (gateway.laplacetec.com/mcp).
 * 이 세션의 MCP 클라이언트와 달리, 여기서는 우리가 JSON-RPC 본문을 직접 만들어
 * dict 인자를 정확히 전달한다 (문자열화 문제 없음).
 *
 * env: LAPLACE_API_KEY (필수), LAPLACE_API_BASE (선택, 기본 gateway URL)
 */

const MCP_URL = process.env.LAPLACE_API_BASE || 'https://gateway.laplacetec.com/mcp/';
const PROJECT_ID = Number(process.env.LAPLACE_PROJECT_ID || 6651);

function authHeaders(extra, auth) {
  const key = process.env.LAPLACE_API_KEY;
  if (!key) throw new Error('LAPLACE_API_KEY_MISSING');
  const a = auth || {};
  const header = a.header || process.env.LAPLACE_AUTH_HEADER || 'Laplace-Api-Key';
  const prefix = a.prefix != null ? a.prefix
    : (process.env.LAPLACE_AUTH_PREFIX != null ? process.env.LAPLACE_AUTH_PREFIX : '');
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  h[header] = prefix + key;
  return Object.assign(h, extra || {});
}

// SSE 또는 JSON 응답에서 JSON-RPC 메시지 배열을 뽑는다
function parseMessages(text, ctype) {
  if (ctype && ctype.indexOf('text/event-stream') !== -1) {
    const out = [];
    for (const block of text.split(/\r?\n\r?\n/)) {
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('data:')) {
          const d = line.slice(5).trim();
          if (d && d !== '[DONE]') { try { out.push(JSON.parse(d)); } catch (e) { /* skip */ } }
        }
      }
    }
    return out;
  }
  try { return [JSON.parse(text)]; } catch (e) { return []; }
}

async function post(session, payload, auth) {
  const headers = authHeaders(session ? { 'Mcp-Session-Id': session } : {}, auth);
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  const ctype = res.headers.get('content-type') || '';
  return {
    status: res.status,
    sid: res.headers.get('mcp-session-id') || session || null,
    ctype,
    messages: parseMessages(text, ctype),
    raw: text.slice(0, 800),
  };
}

/* tools/call 한 번 실행. 결과의 content(text) 를 JSON 파싱해 반환. debug=true 면 원시 정보 포함 */
async function callTool(name, args, opts) {
  const debug = opts && opts.debug;
  const auth = opts && opts.auth;
  const trace = [];

  // 1) initialize
  let r = await post(null, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: '100bs-mediamix-cron', version: '1.0' },
    },
  }, auth);
  trace.push({ step: 'initialize', status: r.status, ctype: r.ctype, raw: debug ? r.raw : undefined });
  if (r.status >= 400) throw new Error('MCP_INIT_' + r.status + '_' + r.raw);
  const sid = r.sid;

  // 2) initialized notification
  await post(sid, { jsonrpc: '2.0', method: 'notifications/initialized' }, auth);

  // 3) tools/call
  r = await post(sid, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, auth);
  trace.push({ step: 'tools/call', status: r.status, ctype: r.ctype, raw: debug ? r.raw : undefined });
  if (r.status >= 400) {
    const e = new Error('MCP_CALL_' + r.status + '_' + r.raw);
    e.trace = trace; throw e;
  }
  const msg = r.messages.find((m) => m && m.id === 2) || r.messages[r.messages.length - 1];
  if (!msg) { const e = new Error('MCP_NO_MESSAGE_' + r.raw); e.trace = trace; throw e; }
  if (msg.error) { const e = new Error('MCP_TOOL_ERROR_' + JSON.stringify(msg.error).slice(0, 400)); e.trace = trace; throw e; }

  // 우선순위: structuredContent (대용량 응답 시 content는 생략될 수 있음) → content[].text
  let data = null;
  const result = msg.result || {};
  if (result.structuredContent != null) {
    data = result.structuredContent;
  } else if (Array.isArray(result.content)) {
    const t = result.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('');
    try { data = JSON.parse(t); } catch (e) { data = t; }
  } else {
    data = result;
  }
  return debug ? { data, trace, sid } : data;
}

/* records 포맷으로 집계 조회. rows 배열 반환.
 * spec: { freq, date_filters, dimensions, measures, ...extra } */
async function queryRecords(dataSource, spec, opts) {
  const args = Object.assign({
    'data_source__path': dataSource,
    'project-id': String(PROJECT_ID),
    response_type: 'records',
  }, spec);
  const out = await callTool('query_dashboard', args, opts);
  if (out && Array.isArray(out.data)) return out.data;
  if (Array.isArray(out)) return out;
  throw new Error('LAPLACE_QUERY_BAD_RESULT_' + JSON.stringify(out).slice(0, 200));
}

/* 집계 measure 헬퍼. AGG('spend') → sum(spend). AGG('pay_cnt',{col:'order_id',f:'count_distinct'}) */
function AGG(name, o) {
  o = o || {};
  return { name, base_column: { name: o.col || name }, aggregate_function: o.f || 'sum' };
}

async function listTools() {
  let r = await post(null, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: '100bs-mm', version: '1.0' } },
  });
  if (r.status >= 400) throw new Error('MCP_INIT_' + r.status + '_' + r.raw);
  const sid = r.sid;
  await post(sid, { jsonrpc: '2.0', method: 'notifications/initialized' });
  r = await post(sid, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const msg = r.messages.find((m) => m && m.id === 3) || r.messages[r.messages.length - 1];
  return msg && msg.result;
}

module.exports = { callTool, listTools, queryRecords, AGG, MCP_URL, PROJECT_ID };
