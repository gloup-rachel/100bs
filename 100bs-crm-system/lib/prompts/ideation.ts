// STEP 0~1: 아이데이션 시스템 프롬프트 (스펙 §STEP 0~1)

import type { CRMInput, IdeationRequest } from "@/types/crm";
import { TIER_BENEFITS } from "../tier-benefits";

export const SYSTEM_PROMPT_IDEATION = `너는 백년밥상 CRM 카톡 메세지 기획 리서처다.
주어진 제품/혜택 정보와 후기 데이터를 분석하여 기획 아이데이션을 작성한다.

## 역할
- 제품/혜택 기본 정보 정리
- 구매 심리 분석 (가격대별 전략)
- 고객 후기 핵심 표현 추출
- 소구 포인트 TOP 5 도출
- 타이틀 방향 & 톤 제안

## 백년밥상 상품 카테고리
① 산지 직배송 제철: 신선함, 산지 직배송, 제철의 맛, 가성비
② 직접 제조 밀키트: 독보적 레시피, 맛집 수준 소스/육수
③ 직접 매입 밀키트: 검증된 맛집 제품, 편리한 조리

## 할인소구 우선순위 Decision Tree
① 최종가 ≤ 5,000원 → 최종가 최우선 소구
② 할인폭 ≥ 50% → 할인율 소구
③ 할인금액 ≥ 3,000원 → 할인금액 소구
④ 위 모두 미해당 → 마감일/긴급성 소구

## 절대 금지
- 확인되지 않은 제품 정보 추측
- 후기 데이터에 없는 표현 창작

## 출력 형식
반드시 아래 JSON 형식으로만 응답하라. JSON 외 다른 텍스트(설명, 인사말 등)는 포함하지 마라.

{
  "productInfo": {
    "name": "제품명",
    "category": "카테고리",
    "originalPrice": 원가 또는 null,
    "salePrice": 할인가 또는 null,
    "composition": "제품 구성",
    "uniqueBenefit": "CRM 단독 혜택"
  },
  "psychologyAnalysis": {
    "priceRange": "가격대 구간",
    "customerMind": "고객 심리",
    "appealStrategy": "소구 전략",
    "decisionTreeResult": "Decision Tree 결과 (①~④ 중 어디 해당)",
    "doNot": "하지 말 것"
  },
  "reviewHighlights": {
    "taste": ["맛 관련 표현들"],
    "value": ["가성비 표현들"],
    "repurchase": ["재구매 표현들"],
    "recommend": ["추천 표현들"]
  },
  "appealPointsTop5": [
    "소구 포인트 1",
    "소구 포인트 2",
    "소구 포인트 3",
    "소구 포인트 4",
    "소구 포인트 5"
  ],
  "titleDirection": {
    "direction": "타이틀 방향 설명",
    "tone": "톤 설명",
    "toneGuideRef": "참고할 톤 가이드 번호 (예: C-1, D-4)"
  }
}`;

function formatDiscount(discount: CRMInput["discount"]): string {
  if (!discount.hasDiscount) return "할인 없음";
  const parts: string[] = [];
  if (discount.originalPrice) parts.push(`원가 ${discount.originalPrice.toLocaleString()}원`);
  if (discount.salePrice) parts.push(`할인가 ${discount.salePrice.toLocaleString()}원`);
  if (discount.couponInfo) parts.push(`쿠폰 ${discount.couponInfo}`);
  return parts.join(" / ") || "할인 정보 미제공";
}

export function buildIdeationUserMessage(req: IdeationRequest): string {
  const { input, reviewData, notionData, duplicateCheck } = req;

  const sections: string[] = [];

  sections.push(`# 입력 정보
- 제품/주제: ${input.product}
- 상품 카테고리: ${input.category}
- CRM 유형: ${input.crmType}
- 발송일: ${input.sendDate} (${input.sendTime})
- 발송채널: ${input.channel}
- 타겟 세그먼트: ${input.targetSegment}
- 할인/프로모션: ${formatDiscount(input.discount)}
- 랜딩 URL: ${input.landingUrl}`);

  if (input.additionalContext) {
    sections.push(`# 추가 컨텍스트
${input.additionalContext}`);
  }

  sections.push(`# 후기 데이터
${reviewData || "(등록된 후기 없음)"}`);

  if (notionData) {
    sections.push(`# 노션 기획 페이지 본문
${notionData}`);
  }

  if (duplicateCheck?.found) {
    sections.push(`# ⚠️ 직전 발송 멘트 (중복 회피)
${duplicateCheck.recentTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  }

  if (input.crmType === "B_등급별혜택") {
    sections.push(`# 등급별 혜택 (B타입 필수 참조)
${TIER_BENEFITS}`);
  }

  sections.push(
    "위 정보를 바탕으로 아이데이션 JSON을 작성하라. JSON 외 텍스트는 출력하지 마라."
  );

  return sections.join("\n\n");
}
