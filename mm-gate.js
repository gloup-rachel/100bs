/* 미디어믹스/KPI/리포트 공용 로그인 게이트
 * /api/mm/* 요청에 x-bb-pw 헤더(encodeURIComponent)를 붙이고, 401이면 비밀번호 오버레이를 띄운다.
 * TEAM_PW(열람) 또는 ADMIN_PW(편집) 모두 통과. pw는 sessionStorage에 보관(탭 단위). */
(function () {
  'use strict';
  var PW_KEY = 'mm_pw';
  var origFetch = window.fetch.bind(window);

  function getPw() { try { return sessionStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; } }
  function setPw(v) { try { sessionStorage.setItem(PW_KEY, v); } catch (e) { /* noop */ } }

  function withPw(opts) {
    opts = Object.assign({}, opts || {});
    var pw = getPw();
    var h = new Headers(opts.headers || {});
    if (pw) h.set('x-bb-pw', encodeURIComponent(pw));
    opts.headers = h;
    return opts;
  }

  var pending = null;
  function askPw() {
    if (!pending) {
      pending = new Promise(function (resolve) {
        overlay(function (pw) { setPw(pw); pending = null; resolve(); });
      });
    }
    return pending;
  }

  window.fetch = function (url, opts) {
    var u = (typeof url === 'string') ? url : (url && url.url) || '';
    if (u.indexOf('/api/mm/') === -1) return origFetch(url, opts);
    return (async function () {
      for (var i = 0; i < 6; i++) {
        var res = await origFetch(url, withPw(opts));
        if (res.status !== 401) return res;
        await askPw();
      }
      return origFetch(url, withPw(opts));
    })();
  };

  function overlay(onOk) {
    var wrap = document.createElement('div');
    wrap.setAttribute('style', 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(18,20,26,.55);backdrop-filter:blur(2px);font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif');
    wrap.innerHTML =
      '<form style="background:#fff;color:#15171c;border-radius:14px;padding:24px 22px;width:min(92vw,340px);box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:12px">'
      + '<div style="font-weight:700;font-size:16px">백년밥상 대시보드</div>'
      + '<div style="font-size:13px;color:#5b6070">접근 비밀번호를 입력하세요.</div>'
      + '<input type="password" autocomplete="current-password" aria-label="비밀번호" '
      + 'style="font:inherit;font-size:14px;padding:9px 11px;border:1px solid #d8dbe2;border-radius:8px;outline:none" />'
      + '<div class="err" style="font-size:12px;color:#c0392b;min-height:14px"></div>'
      + '<button type="submit" style="font:inherit;font-size:14px;font-weight:600;padding:9px;border:0;border-radius:8px;background:#15171c;color:#fff;cursor:pointer">확인</button>'
      + '</form>';
    var form = wrap.querySelector('form');
    var input = wrap.querySelector('input');
    var err = wrap.querySelector('.err');
    if (getPw()) err.textContent = '비밀번호가 올바르지 않습니다. 다시 입력하세요.';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim();
      if (!v) { err.textContent = '비밀번호를 입력하세요.'; return; }
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      onOk(v);
    });
    document.body.appendChild(wrap);
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
  }
})();
