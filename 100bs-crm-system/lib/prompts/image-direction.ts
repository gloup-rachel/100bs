// STEP 3: 이미지 기획 방향 시스템 프롬프트 (스펙 §STEP 3)

import type {
  CRMInput,
  FinalMessage,
  IdeationResult,
} from "@/types/crm";

export const SYSTEM_PROMPT_IMAGE_DIRECTION = `너는 백년밥상 CRM 카톡 메세지에 사용할 이미지/디자인 기획자다.
최종 확정된 멘트를 기반으로 이미지 기획 방향을 제안한다.

## 이미지 기획 규칙
- 할인 금액/혜택 금액 = 가장 크게 (타이포 비중 50%+)
- 시즌감 반영 (계절별 컬러·모티프)
- CTA 버튼: "내 쿠폰 확인하기" or "지금 쇼핑하기"

## 등급별 컬러 가이드 (B타입)
| 등급 | 메인 컬러 | 느낌 |
| 손님 | 연분홍 / 밝은 톤 | 친근, 환영 |
| 단골 | 골드 / 웜톤 | 신뢰, 소속감 |
| VIP | 퍼플 / 딥톤 | 프리미엄, 특별 |
| VVIP | 블랙 & 골드 | 최고급, 왕관 |

## 출력 형식
반드시 아래 JSON 형식으로만 응답하라. JSON 외 텍스트는 포함하지 마라.

{
  "mainVisual": "메인 비주얼 방향 (구체적 묘사)",
  "colorScheme": "컬러 스킴 (HEX 권장)",
  "typography": "타이포그래피 가이드 (폰트 무게·크기 비중)",
  "ctaButton": "CTA 버튼 텍스트 + 색상",
  "layoutSuggestion": "레이아웃 제안 (가로/세로 비율, 요소 배치)",
  "seasonalMotif": "시즌 모티프 (계절별 컬러·아이콘)"
}`;

export function buildImageDirectionUserMessage(
  input: CRMInput,
  finalMessage: FinalMessage,
  ideation: IdeationResult
): string {
  return `# 입력 정보
- 제품: ${input.product}
- 카테고리: ${input.category}
- CRM 유형: ${input.crmType}
- 발송일: ${input.sendDate}
- 할인: ${input.discount.hasDiscount ? `${input.discount.originalPrice ?? "-"}원 → ${input.discount.salePrice ?? "-"}원` : "할인 없음"}

# 최종 멘트
Title: ${finalMessage.title}

Body:
${finalMessage.body}

CTA: ${finalMessage.cta}

# 소구 포인트
${ideation.appealPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

위 정보를 바탕으로 이미지 기획 방향 JSON을 작성하라. JSON 외 텍스트는 출력하지 마라.`;
}
