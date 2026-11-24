/* 매칭 v2 유닛테스트:  node scripts/test_matcher.js
 * resolveCampaignId / resolveMatch / extractCode 의 코드 우선 매칭 검증. */
const { resolveCampaignId, resolveMatch, extractCode } = require('../api/_lib.js');

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

// 코드 기반 맵 (슬롯당 1행)
const MAP = [
  { campaign_id: 'OWN-NEW-ALL',  match_type: 'code', keyword: 'OWN-NEW-ALL',  status: 'confirmed' },
  { campaign_id: 'OWN-EXI-WEEK', match_type: 'code', keyword: 'OWN-EXI-WEEK', status: 'confirmed' },
  { campaign_id: 'CBT-NEW-ALL',  match_type: 'code', keyword: 'CBT-NEW-ALL',  status: 'confirmed' },
  { campaign_id: 'CBT-EXI-WEEK', match_type: 'code', keyword: 'CBT-EXI-WEEK', status: 'confirmed' },
  { campaign_id: 'SS-OLD',       match_type: 'code', keyword: 'SS-OLD',       status: 'confirmed' },
  { campaign_id: 'SA-SP',        match_type: 'code', keyword: 'SA-SP',        status: 'confirmed' },
  { campaign_id: 'SA-BRAND',     match_type: 'code', keyword: 'SA-BRAND',     status: 'confirmed' },
  { campaign_id: 'GFA-AB',       match_type: 'code', keyword: 'GFA-AB',       status: 'confirmed' },
  { campaign_id: 'RESERVE',      match_type: 'code', keyword: 'RESERVE',      status: 'budget_only' }, // 집행없음
  // 예외(override): 코드 없는 특정 캠페인을 강제 배정 (code 매칭 불가 건만 해당)
  { campaign_id: 'CBT-EXI-WEEK', match_type: 'exact', ad_account_name: '백년밥상_협력광고(NAVER)', ad_channel_name: 'FBIG', campaign_name: '협찬_직접배정_캠페인', status: 'confirmed' },
];

// extractCode
eq('extractCode 앞', extractCode('[CBT-NEW-ALL] 전략제품_닭발'), 'CBT-NEW-ALL');
eq('extractCode 한글대괄호 무시', extractCode('[상시] 애드부스트'), null);
eq('extractCode 한글뒤 코드', extractCode('[상시] [GFA-AB] 부스트'), 'GFA-AB');
eq('extractCode 없음', extractCode('그냥 캠페인명'), null);

// 1) 캠페인명 코드
eq('캠페인 코드', resolveCampaignId({ ad_account_name: '캠핑밀키트 백년밥상', ad_channel_name: 'FBIG', campaign_name: '[OWN-NEW-ALL] 신규 전략제품_떡볶이' }, MAP), 'OWN-NEW-ALL');
// 2) 광고그룹 코드 (파워링크) — 캠페인명엔 코드 없음
eq('광고그룹 코드', resolveCampaignId({ ad_account_name: 'pym12', ad_channel_name: 'NAVER_SEARCHAD', campaign_name: '(공통)파워링크_스마트스토어', adset_name: '[SA-SP] 소꼬리찜' }, MAP), 'SA-SP');
// 3) 광고그룹 코드가 캠페인 코드보다 우선
eq('adset 코드 우선', resolveCampaignId({ campaign_name: '[SA-BRAND] 공통', adset_name: '[SA-SP] 수제꼬치' }, MAP), 'SA-SP');
// 4) 코드가 전역 고유 → 계정/채널 달라도 라우팅
eq('코드 전역 고유', resolveCampaignId({ ad_account_name: '엉뚱계정', ad_channel_name: 'XYZ', campaign_name: '[SS-OLD] 수제꼬치' }, MAP), 'SS-OLD');
// 5) 다대일 (같은 코드 여러 캠페인)
eq('다대일 A', resolveCampaignId({ campaign_name: '[SS-OLD] 쪽갈비구이' }, MAP), 'SS-OLD');
eq('다대일 B', resolveCampaignId({ campaign_name: '[SS-OLD] 동태탕' }, MAP), 'SS-OLD');
// 6) 코드 없음 → unmapped (경보)
eq('코드없음 unmapped', resolveCampaignId({ campaign_name: '코드 안붙인 신규 캠페인' }, MAP), 'unmapped');
// 7) 오타 코드 → 맵에 없으면 unmapped
eq('오타코드 unmapped', resolveCampaignId({ campaign_name: '[CBT-NEW-AL] 오타' }, MAP), 'unmapped');
// 8) 예외(override): 코드 없는 캠페인을 exact로 강제 배정
eq('예외 override', resolveCampaignId({ ad_account_name: '백년밥상_협력광고(NAVER)', ad_channel_name: 'FBIG', campaign_name: '협찬_직접배정_캠페인' }, MAP), 'CBT-EXI-WEEK');
// 9) budget_only 코드는 매칭 안 됨 → unmapped
eq('budget_only 제외', resolveCampaignId({ campaign_name: '[RESERVE] 예비비 혹시 집행' }, MAP), 'unmapped');
// 10) reason 노출
eq('reason 코드', resolveMatch({ campaign_name: '[GFA-AB] 상시 부스트' }, MAP).reason, 'code [GFA-AB]');
eq('reason unmapped', resolveMatch({ campaign_name: '노코드' }, MAP).reason, 'unmapped');

// 레거시 호환 (전환기): 구 맵 행이 남아있어도 동작
const LEGACY = [
  { campaign_id: 'SHOP_OLD', match_type: 'fallback', ad_account_name: 'pym12', ad_channel_name: 'NAVER_SEARCHAD', status: 'confirmed' },
  { campaign_id: 'SHOP_LOW', match_type: 'campaign_in', campaign_name: '저단가', ad_account_name: 'pym12', ad_channel_name: 'NAVER_SEARCHAD', status: 'confirmed' },
];
eq('레거시 campaign_in', resolveCampaignId({ ad_account_name: 'pym12', ad_channel_name: 'NAVER_SEARCHAD', campaign_name: '저단가운영' }, LEGACY), 'SHOP_LOW');
eq('레거시 fallback', resolveCampaignId({ ad_account_name: 'pym12', ad_channel_name: 'NAVER_SEARCHAD', campaign_name: '아무 쇼핑 캠페인' }, LEGACY), 'SHOP_OLD');
// 코드맵이 있으면 코드가 레거시보다 우선
eq('코드 우선(혼재)', resolveCampaignId({ ad_account_name: 'pym12', ad_channel_name: 'NAVER_SEARCHAD', campaign_name: '[SA-SP] 소꼬리찜' }, MAP.concat(LEGACY)), 'SA-SP');

console.log(`\n${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
