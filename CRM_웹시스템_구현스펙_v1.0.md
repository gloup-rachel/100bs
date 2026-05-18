# 백년밥상 CRM 메세지 작성 웹 시스템 — 구현 스펙 v1.0

> 작성일: 2026-05-08
> 작성자: Rachel (GLO:UP) + Claude AI
> 목적: Vercel 기반 독립 웹 시스템으로 CRM 메세지 생성~시스템 반영까지 자동화

### 구현 범위

| 범위 | 포함 여부 | 비고 |
|------|----------|------|
| STEP 0~2.5 (폼~검증) | ✅ 1차 MVP | 핵심 워크플로우 |
| STEP 3 (이미지 기획) | ✅ 1차 MVP | Claude API |
| STEP 4 - Google Sheets | ✅ 1차 MVP | Apps Script POST |
| STEP 4 - Notion 반영 | ⏳ 2차 구현 | Notion API 연동 별도 |
| 후기 DB (Google Sheets) | ✅ 1차 MVP | 조회 + 업로드 |

---

## 0. 프로젝트 구조 (scaffold)

> Claude Code에 이 스펙 문서를 전달할 때, 아래 구조대로 생성을 지시한다.

```
100bs-crm-system/
│
├── app/                            # Next.js App Router
│   ├── layout.tsx                  # 루트 레이아웃 (헤더, 네비게이션)
│   ├── page.tsx                    # 메인 대시보드 (시스템 카드)
│   ├── crm/
│   │   └── page.tsx                # CRM 작성기 (6스텝 위자드 UI)
│   └── reviews/
│       └── page.tsx                # 후기 DB 관리 (조회 + 업로드)
│
├── app/api/                        # API Routes (서버사이드)
│   ├── crm/
│   │   ├── ideation/route.ts       # STEP 0~1: 아이데이션 생성
│   │   ├── material/route.ts       # STEP 2: 재료 패키지 + 초안
│   │   ├── validate/route.ts       # STEP 2.5: 최종본 검증
│   │   ├── image-direction/route.ts # STEP 3: 이미지 기획 방향
│   │   └── publish/route.ts        # STEP 4: Google Sheets 반영
│   └── reviews/
│       ├── search/route.ts         # 후기 DB 검색
│       └── upload/route.ts         # 후기 데이터 적재
│
├── components/                     # UI 컴포넌트
│   ├── crm/
│   │   ├── InputForm.tsx           # STEP 0: 입력 폼
│   │   ├── IdeationView.tsx        # STEP 1: 아이데이션 결과 카드
│   │   ├── MaterialPackage.tsx     # STEP 2: 재료 패키지 렌더링
│   │   ├── DraftEditor.tsx         # STEP 2→2.5: 초안→최종본 편집기
│   │   ├── ValidationResult.tsx    # STEP 2.5: 검증 결과
│   │   ├── ImageDirection.tsx      # STEP 3: 이미지 기획 방향
│   │   └── PublishPanel.tsx        # STEP 4: 시스템 반영 버튼
│   ├── reviews/
│   │   ├── ReviewSearch.tsx        # 후기 검색 UI
│   │   └── ReviewUpload.tsx        # 후기 업로드 UI
│   └── common/
│       ├── StepWizard.tsx          # 스텝 위자드 네비게이션
│       ├── LoadingSpinner.tsx      # 로딩 상태
│       └── StatusBadge.tsx         # 검증 상태 뱃지 (✅/⚠️)
│
├── lib/                            # 유틸리티 & 비즈니스 로직
│   ├── prompts/
│   │   ├── ideation.ts             # 아이데이션 시스템 프롬프트
│   │   └── material.ts             # 재료 패키지 시스템 프롬프트
│   ├── tone-guide.ts              # ★ 톤 가이드 원문 상수 (아래 부록 A 참조)
│   ├── validation.ts              # 글자수/5대금지 검증 로직
│   ├── utm.ts                     # UTM 자동 생성
│   ├── send-time.ts               # 발송시간 자동 계산
│   ├── apps-script.ts             # Apps Script POST 래퍼
│   └── google-sheets.ts           # Google Sheets API (후기 DB)
│
├── types/
│   └── crm.ts                     # CRMSession, Request/Response 타입 전체
│
├── .env.local                     # 환경 변수 (API 키)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

### 파일 생성 순서 (Claude Code 가이드)

1. `npx create-next-app@latest 100bs-crm-system --typescript --tailwind --app`
2. `types/crm.ts` — 타입 정의 먼저 (이 문서 섹션 2-2 전체 복사)
3. `lib/` — 유틸리티 함수들 (validation, utm, send-time, apps-script)
4. `lib/tone-guide.ts` — 톤 가이드 원문 상수 (부록 A)
5. `lib/prompts/` — 시스템 프롬프트 상수 (이 문서 섹션 3 참조)
6. `app/api/` — API Routes (각 스텝별)
7. `components/` — UI 컴포넌트
8. `app/` — 페이지 조립

### 주요 의존성

```json
{
  "dependencies": {
    "next": "^14",
    "react": "^18",
    "@anthropic-ai/sdk": "^0.30",
    "googleapis": "^140",
    "xlsx": "^0.18"
  },
  "devDependencies": {
    "typescript": "^5",
    "tailwindcss": "^3",
    "@types/react": "^18"
  }
}
```

---

## 1. 시스템 개요

### 1-1. 목표

Claude 앱/Cowork에 접속하지 않고, 웹 브라우저에서 백년밥상 CRM 카톡 메세지의 기획 → 재료 패키지 → 초안 → 최종본 검증 → 시스템 반영까지 전 과정을 처리하는 독립 웹 시스템.

### 1-2. 기술 스택

| 레이어 | 기술 | 용도 |
|--------|------|------|
| Frontend | Next.js (React) | 폼 UI + 결과 렌더링 |
| Hosting | Vercel | 프론트엔드 + API Routes |
| AI Engine | Claude API (Anthropic) | 아이데이션 / 재료 패키지 / 초안 생성 |
| Data - 혜택/기획 | Notion API | CRM 기획 페이지 조회 / 멘트 기입 |
| Data - 시트 반영 | Google Apps Script | CRM 시트 POST |
| Data - 후기 DB | Google Sheets API | 후기 데이터 조회 / 추가 적재 |

### 1-3. 워크플로우 전체 흐름

```
[STEP 0] 사용자 폼 입력 (모든 Question 포인트 포함)
    ↓
[STEP 0~1] Claude API → 아이데이션 생성 (후기 DB 자동 조회)
    ↓
[STEP 2] 재료 패키지 + 초안 렌더링 → Rachel 확인
    ↓
[STEP 2→2.5] 초안 기반 최종본 직접 편집 → 자동 검증
    ↓
[STEP 3] 이미지 기획 방향 제안 렌더링
    ↓
[STEP 4] 시스템 반영 버튼 (Notion + Google Sheets)
```

---

## 2. 아키텍처 상세

### 2-1. API Routes 구조

```
/api/
├── crm/
│   ├── ideation        POST  — STEP 0~1: 아이데이션 생성
│   ├── material        POST  — STEP 2: 재료 패키지 + 초안 생성
│   ├── validate        POST  — STEP 2.5: 최종본 검증
│   ├── image-direction POST  — STEP 3: 이미지 기획 방향
│   └── publish         POST  — STEP 4: 시스템 반영
│
├── reviews/
│   ├── search          GET   — 후기 DB에서 제품별 검색
│   └── upload          POST  — 새 후기 데이터 적재
│
└── notion/                          # ⏳ 2차 구현
    ├── fetch           GET   — 노션 페이지 조회 (2차)
    └── check-duplicate GET   — 전일 멘트 중복 체크 (2차)
```

### 2-2. 상태 관리 (멀티스텝)

각 스텝의 입출력을 클라이언트 상태로 유지하며, 다음 API 호출 시 컨텍스트로 전달.

```typescript
interface CRMSession {
  // STEP 0: 폼 입력값
  input: {
    product: string;              // 제품명
    category: '산지직배송' | '직접제조' | '직접매입';
    sendDate: string;             // YYYY-MM-DD
    sendTime: string;             // HH:MM (자동 계산: 평일 08:30 / 주말 11:00)
    channel: '카톡' | '문자';
    discount: {
      hasDiscount: boolean;
      originalPrice?: number;
      salePrice?: number;
      couponInfo?: string;
    };
    crmType: 'A_단일프로모션' | 'B_등급별혜택' | 'C_복수제품추천' | 'D_시즌후킹';
    targetSegment: '전체' | '등급별' | '세그먼트별';
    landingUrl: string;
    notionPageUrl?: string;       // 노션 CRM 기획 페이지 (선택)
    additionalContext?: string;   // 추가 배경 (예: 날씨, 시즌)
  };

  // STEP 0~1: 아이데이션 결과
  ideation: {
    productInfo: object;          // 제품/혜택 기본 정보
    psychologyAnalysis: object;   // 구매 심리 분석
    reviewHighlights: string[];   // 후기 핵심 표현
    appealPoints: string[];       // 소구 포인트 TOP 5
    titleDirection: string;       // 타이틀 방향
    raw: string;                  // Claude 원문 응답
  } | null;

  // STEP 2: 재료 패키지 + 초안
  material: {
    titleOptions: Array<{
      type: string;               // 가격임팩트형 / 긴급성형 / 경험소환형
      text: string;
      recommended: boolean;
      reason?: string;
    }>;
    reviewQuotes: Array<{
      quote: string;
      reviewer: string;
    }>;
    priceFraming: {
      finalPrice: string;
      strategy: string;           // Decision Tree 결과
      comparison: string;         // 외식 대비
      doNot: string;
    };
    productGrouping?: Array<{
      situation: string;
      products: string[];
    }>;
    openingOptions: Array<{
      triggerType: string;
      example: string;
    }>;
    closing: {
      urgency: string;
      delivery: string;
      ctaCandidates: Array<{
        text: string;
        charCount: number;
      }>;
    };
    toneReference: string[];      // 톤 가이드 참고 멘트 번호
    draft: {
      title: string;
      body: string;
      cta: string;
    };
    validation: {
      lineCount: number;
      ctaCharCount: number;
      emDash: boolean;
      checkboxList: boolean;
      unverifiedInfo: boolean;
    };
  } | null;

  // STEP 2.5: 최종본
  finalMessage: {
    title: string;
    body: string;
    cta: string;
  } | null;

  // STEP 2.5: 검증 결과
  validationResult: {
    titleCharCount: number;
    ctaCharCount: number;
    bodyLineCount: number;
    emDashFound: boolean;
    ctaOver12: boolean;
    bodyOver13: boolean;
    utmUrl: string;
    allPassed: boolean;
  } | null;

  // STEP 3: 이미지 기획 방향
  imageDirection: {
    mainVisual: string;
    colorScheme: string;
    typography: string;
    ctaButton: string;
  } | null;

  // 현재 스텝
  currentStep: 0 | 1 | 2 | 2.5 | 3 | 4;
}
```

---

## 3. 각 스텝별 상세 스펙

### STEP 0. 사용자 폼 입력

> 기존 Cowork에서 AskUserQuestion + 대화로 수집하던 모든 정보를 폼 UI로 일괄 수집.

#### UI 구성

```
┌──────────────────────────────────────────────┐
│  백년밥상 CRM 메세지 작성기                      │
├──────────────────────────────────────────────┤
│                                              │
│  📋 기본 정보                                  │
│  ┌────────────────────────────────────────┐  │
│  │ 제품/주제명 [________________]          │  │
│  │                                        │  │
│  │ 상품 카테고리                            │  │
│  │ ○ ①산지직배송 제철  ○ ②직접제조 밀키트    │  │
│  │ ○ ③직접매입 밀키트                      │  │
│  │                                        │  │
│  │ CRM 유형                               │  │
│  │ ○ A. 단일 제품 프로모션                   │  │
│  │ ○ B. 등급별 혜택                         │  │
│  │ ○ C. 복수 제품 추천                      │  │
│  │ ○ D. 시즌 후킹형                         │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  📅 발송 정보                                  │
│  ┌────────────────────────────────────────┐  │
│  │ 발송일 [YYYY-MM-DD]                    │  │
│  │ 발송시간 [자동: 평일 08:30 / 주말 11:00]  │  │
│  │ 발송채널 ○ 카톡  ○ 문자                  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  💰 할인/프로모션                               │
│  ┌────────────────────────────────────────┐  │
│  │ CRM 전용 할인 여부  ○ 있음  ○ 없음       │  │
│  │ (있음 선택 시)                           │  │
│  │ 원가 [______]  할인가 [______]           │  │
│  │ 쿠폰 정보 [________________]            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  🔗 URL & 레퍼런스                             │
│  ┌────────────────────────────────────────┐  │
│  │ 랜딩 URL [________________________]     │  │
│  │ 노션 기획 페이지 (선택) [____________]    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  💬 추가 컨텍스트 (선택)                        │
│  ┌────────────────────────────────────────┐  │
│  │ [                                      ] │  │
│  │ [  예: 주말 28도 예보, 더위 시즌 소구     ] │  │
│  │ [                                      ] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  📎 후기 데이터 추가 업로드 (선택)               │
│  ┌────────────────────────────────────────┐  │
│  │ [파일 선택] .xlsx / .csv               │  │
│  │ ※ 기존 후기 DB에서 자동 조회됩니다.       │  │
│  │   추가 데이터가 있을 때만 업로드하세요.    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│          [ 아이데이션 시작하기 →]               │
│                                              │
└──────────────────────────────────────────────┘
```

#### 폼 검증 규칙

| 필드 | 필수 | 검증 |
|------|------|------|
| 제품/주제명 | ✅ | 빈값 불가 |
| 상품 카테고리 | ✅ | 반드시 선택 |
| CRM 유형 | ✅ | 반드시 선택 |
| 발송일 | ✅ | 오늘 이후 날짜 |
| 발송시간 | 자동 | 평일(월~금) → 08:30 / 주말(토~일) → 11:00 |
| 발송채널 | ✅ | 기본값: 카톡 |
| 할인 여부 | ✅ | "있음" 선택 시 원가/할인가 필수 |
| 랜딩 URL | ✅ | URL 형식 검증 |
| 노션 페이지 | 선택 | URL 형식 검증 |
| 추가 컨텍스트 | 선택 | 자유 텍스트 |
| 후기 파일 | 선택 | .xlsx / .csv 확장자 검증 |

#### 발송시간 자동 계산 로직

```typescript
function getSendTime(dateStr: string): string {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=일, 6=토
  return (dayOfWeek === 0 || dayOfWeek === 6) ? '11:00' : '08:30';
}
```

---

### STEP 0~1. 아이데이션 생성

> API Route: `POST /api/crm/ideation`

#### Request

```typescript
interface IdeationRequest {
  input: CRMSession['input'];       // 폼 입력값 전체
  reviewData?: string;              // 후기 DB에서 조회한 텍스트 (서버에서 자동 조회)
  notionData?: string;              // 노션 페이지 본문 (서버에서 자동 조회)
  duplicateCheck?: {                // 전일 멘트 중복 체크 결과
    found: boolean;
    recentTitles: string[];
  };
}
```

#### 서버 처리 흐름

```
1. 후기 DB (Google Sheets)에서 제품명으로 검색 → 후기 텍스트 추출
2. 파일 업로드가 있으면 → 파싱 후 후기 DB에 append + 컨텍스트에 추가
3. Claude API 호출 (시스템 프롬프트 + 컨텍스트)
4. 응답 파싱 → 구조화된 JSON 반환

# (2차 구현 시 추가)
# - 노션 페이지 URL이 있으면 → Notion API로 본문 조회
# - Notion API로 직전 2일 CRM 페이지 검색 → 중복 체크
```

#### Claude API 호출 스펙

```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',  // 비용 효율. 필요 시 opus로 변경
  max_tokens: 4096,
  system: SYSTEM_PROMPT_IDEATION,     // 아래 정의
  messages: [
    {
      role: 'user',
      content: buildIdeationPrompt(input, reviewData, notionData)
    }
  ]
});
```

#### 시스템 프롬프트: 아이데이션 (`SYSTEM_PROMPT_IDEATION`)

```
너는 백년밥상 CRM 카톡 메세지 기획 리서처다.
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
반드시 아래 JSON 형식으로 응답하라:

{
  "productInfo": {
    "name": "제품명",
    "category": "카테고리",
    "originalPrice": 원가,
    "salePrice": 할인가 또는 null,
    "composition": "제품 구성",
    "uniqueBenefit": "CRM 단독 혜택"
  },
  "psychologyAnalysis": {
    "priceRange": "가격대 구간",
    "customerMind": "고객 심리",
    "appealStrategy": "소구 전략",
    "decisionTreeResult": "Decision Tree 결과 (①~④)",
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
}
```

#### Response

```typescript
interface IdeationResponse {
  success: boolean;
  ideation: CRMSession['ideation'];
  duplicateWarning?: {
    found: boolean;
    recentTitles: string[];
    suggestion: string;
  };
}
```

#### UI 렌더링

아이데이션 결과를 카드 형태로 렌더링. "OK — 다음 단계로" 버튼 클릭 시 STEP 2로 진행.

---

### STEP 2. 멘트 재료 패키지 + 초안

> API Route: `POST /api/crm/material`

#### Request

```typescript
interface MaterialRequest {
  input: CRMSession['input'];
  ideation: CRMSession['ideation'];  // STEP 1 결과
}
```

#### 시스템 프롬프트: 재료 패키지 (`SYSTEM_PROMPT_MATERIAL`)

```
너는 백년밥상 CRM 카톡 메세지의 재료 정리자다.
아이데이션 결과를 기반으로 멘트 재료 패키지 + 참고용 초안을 작성한다.

## 역할
최종 카피라이팅은 마케터(Rachel)가 한다.
너는 Rachel이 멘트를 빠르게 작성할 수 있도록 재료를 정리한다.

## 재료 패키지 구성
1. 제목 방향 3안 (가격임팩트형 / 긴급성형 / 경험소환형)
2. 후기 인용문 (원문 그대로, 최소 3개)
3. 가격 프레이밍 (Decision Tree 근거 포함)
4. 상품 그루핑 제안 (복수 제품 시)
5. 오프닝 방향 2~3안
6. 클로징 재료 (긴급성 + 배송 + CTA 후보 3개)
7. 톤 가이드 참고 멘트 번호

## 초안 작성 규칙
재료 패키지를 기반으로 참고용 초안을 1개 작성한다.
- 본문 11~13줄 이내
- CTA 12자 이내
- em dash(—) 사용 금지
- ✅ 체크박스 나열 금지
- 확인 안 된 정보 추측 금지

## 톤 참고
아래 부록 A의 톤 가이드 전문을 이 위치에 삽입한다. (lib/tone-guide.ts에서 상수로 관리)

## 출력 형식
반드시 아래 JSON 형식으로 응답하라:

{
  "titleOptions": [
    {"type": "가격임팩트형", "text": "...", "recommended": false},
    {"type": "긴급성/희소성형", "text": "...", "recommended": true, "reason": "추천 이유"},
    {"type": "경험소환형", "text": "...", "recommended": false}
  ],
  "reviewQuotes": [
    {"quote": "후기 원문", "reviewer": "리뷰어명"}
  ],
  "priceFraming": {
    "finalPrice": "최종가",
    "strategy": "Decision Tree 결과 + 근거",
    "comparison": "외식 대비 비교",
    "doNot": "하지 말 것"
  },
  "productGrouping": [
    {"situation": "상황 A", "products": ["제품1", "제품2"]}
  ],
  "openingOptions": [
    {"triggerType": "날씨 선언형", "example": "1줄 예시"}
  ],
  "closing": {
    "urgency": "긴급성 표현",
    "delivery": "배송 표현",
    "ctaCandidates": [
      {"text": "CTA 텍스트", "charCount": 8}
    ]
  },
  "toneReference": ["C-1 국물추천", "C-4 주말BEST"],
  "draft": {
    "title": "타이틀",
    "body": "본문 (줄바꿈은 \\n)",
    "cta": "CTA 텍스트"
  },
  "validation": {
    "lineCount": 11,
    "ctaCharCount": 8,
    "emDash": false,
    "checkboxList": false,
    "unverifiedInfo": false
  }
}
```

#### UI 렌더링

재료 패키지의 각 항목을 개별 카드/섹션으로 렌더링하고, 초안은 편집 가능한 텍스트 영역으로 표시.

```
┌──────────────────────────────────────────────┐
│  📦 멘트 재료 패키지                            │
├──────────────────────────────────────────────┤
│                                              │
│  ■ 제목 방향 3안                               │
│  ┌──────────────────────────────────────┐    │
│  │ ○ #1 [가격임팩트형] "..."             │    │
│  │ ● #2 [긴급성형] "..." ⭐ 추천         │    │
│  │ ○ #3 [경험소환형] "..."               │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ■ 후기 인용문 / 가격 프레이밍 / ...           │
│  (각 항목 카드 형태로)                         │
│                                              │
├──────────────────────────────────────────────┤
│  ✏️ 초안 → 최종본 편집기                       │
│  ┌──────────────────────────────────────┐    │
│  │ Title: [편집 가능 필드____________]    │    │
│  │                                      │    │
│  │ [                                    ] │   │
│  │ [  초안 본문이 미리 채워져 있음         ] │   │
│  │ [  Rachel이 직접 수정하여 최종본 작성   ] │   │
│  │ [                                    ] │   │
│  │                                      │    │
│  │ CTA: [편집 가능 필드____________]      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  실시간 검증:                                  │
│  본문 11줄 ✅ | CTA 8자 ✅ | em dash 없음 ✅   │
│                                              │
│          [ 최종본 확정 + 검증 →]               │
│                                              │
└──────────────────────────────────────────────┘
```

#### 핵심 UX: 초안 → 최종본 인라인 편집

1. 초안이 편집기에 미리 채워진 상태로 렌더링
2. Rachel이 텍스트를 직접 수정 (추가/삭제/교체)
3. 편집 중 실시간 검증 표시 (줄수, CTA 글자수, em dash 체크)
4. "최종본 확정" 클릭 → STEP 2.5 검증 API 호출

---

### STEP 2.5. 최종본 검증

> API Route: `POST /api/crm/validate`

#### Request

```typescript
interface ValidateRequest {
  finalMessage: {
    title: string;
    body: string;
    cta: string;
  };
  input: CRMSession['input'];   // 발송일, URL 등
}
```

#### 서버 처리 (Claude API 불필요 — 순수 로직)

```typescript
function validateFinalMessage(req: ValidateRequest): ValidationResult {
  const { title, body, cta } = req.finalMessage;
  const { sendDate, landingUrl, crmType } = req.input;

  // 1. 글자수 검증
  const titleCharCount = title.length;  // 이모지 포함
  const ctaCharCount = cta.length;      // 공백 포함
  const bodyLines = body.split('\n').filter(line => line.trim() !== '').length;

  // 2. 5대 절대 금지 체크
  const emDashFound = body.includes('—') || title.includes('—');
  const ctaOver12 = ctaCharCount > 12;
  const bodyOver13 = bodyLines > 13;
  // ✅ 나열 체크: ✅로 시작하는 줄이 2개 이상이면 경고
  const checkboxLines = body.split('\n').filter(l => l.trim().startsWith('✅')).length;
  const checkboxWarning = checkboxLines >= 2;

  // 3. UTM 자동 생성
  const utmUrl = generateUTM(landingUrl, crmType, req.input.product);

  // 4. 발송시간 확인
  const sendTime = getSendTime(sendDate);

  // 5. 등급별 멘트 체크 (B타입)
  let tierCheck = true;
  if (crmType === 'B_등급별혜택') {
    // body에 손님/단골/VIP/VVIP 4등급 모두 포함 여부
    const tiers = ['손님', '단골', 'VIP', 'VVIP'];
    tierCheck = tiers.every(t => body.includes(t));
  }

  const allPassed = !emDashFound && !ctaOver12 && !bodyOver13 && !checkboxWarning;

  return {
    titleCharCount,
    ctaCharCount,
    bodyLineCount: bodyLines,
    emDashFound,
    ctaOver12,
    bodyOver13,
    checkboxWarning,
    tierCheck,
    utmUrl,
    sendTime,
    allPassed
  };
}
```

#### UTM 자동 생성 함수

```typescript
function generateUTM(
  baseUrl: string,
  crmType: string,
  productName: string
): string {
  // 이미 UTM 포함된 URL이면 그대로 반환
  if (baseUrl.includes('utm_source=')) return baseUrl;

  const utmContent = crmType === 'B_등급별혜택' ? 'membership' : 'sales';
  const utmTerm = productName
    .toLowerCase()
    .replace(/[가-힣]/g, (char) => romanize(char))  // 한글 → 영문 변환
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}utm_source=kakao&utm_medium=crm&utm_campaign=RT&utm_content=${utmContent}&utm_term=${utmTerm}`;
}
```

#### Response & UI

검증 결과를 즉시 표시. 전체 통과 시 STEP 3으로 자동 진행.

---

### STEP 3. 이미지 기획 방향

> API Route: `POST /api/crm/image-direction`

#### Request

```typescript
interface ImageDirectionRequest {
  input: CRMSession['input'];
  finalMessage: CRMSession['finalMessage'];
  ideation: CRMSession['ideation'];
}
```

#### Claude API 호출

시스템 프롬프트에 이미지 기획 규칙을 포함하여 Claude API 호출.

```
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
```

#### Response

```typescript
interface ImageDirectionResponse {
  mainVisual: string;      // 메인 비주얼 방향
  colorScheme: string;     // 컬러 스킴
  typography: string;      // 타이포그래피 가이드
  ctaButton: string;       // CTA 버튼 텍스트
  layoutSuggestion: string; // 레이아웃 제안
  seasonalMotif: string;   // 시즌 모티프
}
```

---

### STEP 4. 시스템 반영

> API Route: `POST /api/crm/publish`

#### UI: 반영 버튼 2개

```
┌──────────────────────────────────────────────┐
│  🚀 시스템 반영                                │
├──────────────────────────────────────────────┤
│                                              │
│  반영 전 최종 확인:                             │
│  ┌──────────────────────────────────────┐    │
│  │ 📅 발송일: 2026-05-13 (수) 08:30      │    │
│  │ 📝 타이틀: 🍜올여름 첫 더위! ...       │    │
│  │ 📊 본문: 11줄 | CTA: 8자              │    │
│  │ 🔗 랜딩: https://100bs.kr/... + UTM   │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [ 📊 Google Sheets 반영 ]  [ 📝 Notion 반영 (2차) ] │
│                                              │
│  반영 상태:                                    │
│  Google Sheets: ⏳ 대기 중                     │
│  Notion: 🔒 2차 구현 예정                      │
│                                              │
└──────────────────────────────────────────────┘
```

#### 4-A. Google Sheets 반영

```typescript
async function postToGoogleSheets(session: CRMSession): Promise<void> {
  const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbwORPTuBu9GvMfg_nuM15Pd2iQeVS5g52HyDTm5BoE6YLmxUji1MwtQYvj-1T8RfkRcsQ/exec';

  const payload = {
    rows: [{
      '발송일자': session.input.sendDate,
      '발송시간': session.validationResult.sendTime,
      '상태': '피드백 요청',          // ⚠️ 항상 고정
      '발송매체': session.input.channel,
      '연계프로모션': session.input.discount.couponInfo || '-',
      '주력상품': session.input.product,
      '소구점': session.ideation.appealPoints.join(', '),
      '타이틀': session.finalMessage.title,
      '타이틀글자수': session.validationResult.titleCharCount,
      '멘트': session.finalMessage.body,
      'CTA': session.finalMessage.cta,
      'CTA글자수': session.validationResult.ctaCharCount,
      '이미지': session.imageDirection?.mainVisual || '',
      '랜딩URL': session.validationResult.utmUrl
    }]
  };

  // ⚠️ Content-Type 반드시 text/plain (application/json → CORS 에러)
  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  });

  return response.json();
}
```

**Apps Script 핵심 규칙 (웹앱에서도 동일):**

1. `"상태"` 값은 반드시 `"피드백 요청"` 고정
2. Content-Type: `text/plain;charset=utf-8`
3. payload 구조: `{ rows: [{ ... }] }` 배열
4. 다수 제품은 rows 배열에 넣어 1회 POST
5. 타이틀/CTA 글자수는 시스템이 계산하여 숫자값 POST

#### 4-B. Notion 반영 (⏳ 2차 구현)

> **1차 MVP에서는 Notion 반영을 제외한다.**
> Google Sheets 반영만 우선 구현하고, Notion은 2차에서 추가한다.
>
> 2차 구현 시 핵심 규칙:
> - `replace_content` 절대 금지 → `update_content` (부분 교체)만 사용
> - 기존 서식(컬러 헤딩, 토글, 콜아웃) 삭제/변형 금지
> - 기입 후 반드시 fetch로 검증
> - 노션 페이지 블록 구조(토글 ID 등)는 별도 매핑 필요

---

## 4. 후기 데이터 관리 (Google Sheets DB)

### 4-1. 시트 구조

별도 Google Sheets 파일 또는 기존 CRM 시트 내 전용 탭으로 운영.

| 열 | 컬럼명 | 설명 |
|----|--------|------|
| A | 제품명 | 검색 키 |
| B | 리뷰어 | 닉네임 또는 "익명" |
| C | 평점 | 1~5 |
| D | 리뷰본문 | 원문 텍스트 |
| E | 카테고리 | 맛 / 가성비 / 재구매 / 추천 / 기타 |
| F | 등록일 | YYYY-MM-DD |
| G | 소스 | 알파리뷰 / 스마트스토어 / 직접입력 |

### 4-2. API: 후기 검색

> `GET /api/reviews/search?product=냉면`

```typescript
async function searchReviews(productName: string): Promise<ReviewData[]> {
  // Google Sheets API로 시트에서 제품명 필터링
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: REVIEW_SHEET_ID,
    range: '후기DB!A:G',
  });

  return response.data.values
    .filter(row => row[0]?.includes(productName))
    .map(row => ({
      product: row[0],
      reviewer: row[1],
      rating: Number(row[2]),
      content: row[3],
      category: row[4],
      date: row[5],
      source: row[6],
    }));
}
```

### 4-3. API: 후기 업로드

> `POST /api/reviews/upload`

```typescript
async function uploadReviews(file: File): Promise<UploadResult> {
  // 1. 엑셀/CSV 파싱
  const parsed = parseReviewFile(file);

  // 2. Google Sheets에 append
  await sheets.spreadsheets.values.append({
    spreadsheetId: REVIEW_SHEET_ID,
    range: '후기DB!A:G',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: parsed.map(r => [
        r.product, r.reviewer, r.rating,
        r.content, r.category, r.date, r.source
      ])
    }
  });

  return { added: parsed.length, total: /* 전체 행수 */ };
}
```

---

## 5. 환경 변수

```env
# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Notion (2차 구현)
# NOTION_API_KEY=secret_...

# Google (서비스 계정)
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@...iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Sheet IDs
CRM_SHEET_ID=1EuE3PHz8BcXYf1pSF0rODlelXH8HE3YH-q0dEZVA7dg
REVIEW_SHEET_ID=<후기 전용 시트 ID>

# Apps Script
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbwORPTuBu9GvMfg_nuM15Pd2iQeVS5g52HyDTm5BoE6YLmxUji1MwtQYvj-1T8RfkRcsQ/exec
```

---

## 6. 에러 핸들링

| 상황 | 처리 |
|------|------|
| Claude API 타임아웃 | 재시도 1회 → 실패 시 "AI 응답 지연" 안내 |
| Claude API 응답 JSON 파싱 실패 | 원문 텍스트 그대로 표시 + 수동 모드 전환 |
| Notion API 에러 | 에러 메세지 표시 + 채팅 내 백업 텍스트 제공 |
| Apps Script CORS 에러 | Content-Type 확인 안내 (text/plain 필수) |
| Google Sheets 쿼터 초과 | "잠시 후 재시도" 안내 |
| 후기 DB 검색 결과 없음 | "등록된 후기 없음" 표시 + 파일 업로드 유도 |

---

## 7. 시스템 프롬프트에 포함할 파일

Claude API 호출 시 시스템 프롬프트에 삽입해야 하는 파일:

| 파일 | 용도 | 삽입 위치 |
|------|------|----------|
| `confirmed_tone_guide.md` 전문 | 톤 참고 | STEP 2 재료 패키지 프롬프트 |
| `tier_benefits.md` (등급별 혜택) | B타입 참고 | B타입 CRM 시 아이데이션 프롬프트 |

이 파일들은 웹앱 소스코드 내 상수로 포함하거나, CMS/DB에서 관리하여 업데이트 가능하게 구현.

---

## 8. 향후 확장 고려사항

| 항목 | 설명 |
|------|------|
| A/B 테스트 | 초안 2개 생성 → 성과 비교 |
| 발송 이력 대시보드 | 과거 CRM 성과 데이터 시각화 |
| 자동 스케줄링 | 매월 1일/15일 등급별 CRM 자동 생성 |
| 후기 자동 수집 | 크롤링 서버 추가 시 자동 적재 |
| 멀티 채널 | 문자/이메일 템플릿 추가 |
| **Notion 연동 (2차)** | **노션 CRM 기획 페이지 조회/기입/상태 변경** |

---

## 부록 A. 톤 가이드 원문 (`lib/tone-guide.ts`)

> 이 내용을 `lib/tone-guide.ts`에 `export const TONE_GUIDE = \`...\`;` 형태로 저장한다.
> STEP 2 재료 패키지 생성 시 Claude API 시스템 프롬프트에 삽입된다.

```
# 백년밥상 CRM 확정 멘트 레퍼런스 (v5.0)

> Rachel이 직접 작성하거나 최종 확정한 실제 발송 멘트 18개를 유형별로 정리한다.
> 새 멘트 작성 시 이 파일을 반드시 먼저 읽고, 톤·리듬·구조를 참고한다.

---

## A. 단일 제품 프로모션형 (5개)

> 특징: {회원이름} 호칭 없음 / 전체 고객 대상 / 제품 욕망 직접 자극
> 본문 10~13줄 / 이모지 구분자 / 선언·감탄조 우선

### A-1. 제철 미더덕회 (①산지직배송 제철)

Title: 🚨오늘까지! 제철 미더덕회 1만원대

시즌특가회로 먹으면 3배 더 맛있는 미더덕회!
주문 폭주로 1차완판 되었습니다🙇🏻‍♀️

설마 아직도 안드셔보신 분 없죠!?
🌊멍게보다 진한 향에 오독오독한 식감까지
회로 드시면 맛이 진짜 일품이죠🤤

한 번도 안 먹어본 사람은 있어도
한 번만 먹은 사람은 없다는
당일 잡은 A급 미더덕회vV💙

⏰시즌 할인 마감 D-2
이후 이 가격은 더이상 없습니다ㅠㅠ

⚠현재 주문 폭주로 인해 먼저 주문 주신 분들부터 순차 배송 됩니다.
대신 최고로 신선한 미더덕으로 보답하겠습니다❤

### A-2. 오징어 김치 콩나물 국밥 (②직접제조 밀키트)

Title: BEST 국밥 전제품 10% 할인🔥

국내산 묵은지에 콩나물 듬뿍 넣어
🦑 오징어까지 시원-하게 보글보글 끓인
얼큰 오징어 김치콩나물국밥!

백년밥상 직원들도 주 3회 술먹고
이걸로 해장하다가 출시했어요!ㅋㅋㅋ

한입 먹자마자 속이 확! 풀리는
진.짜. 해장국을 가장 저렴하게 만날 수 있는 기회

단 6일간 국밥류 전제품 10% 할인 특가!
갖고 계신 쿠폰 추가사용도 가능해요..👍
한 번 드셔보시면 무조건 쟁여템 됩니다!
지금 초특가일 때 얼-른 만나보세요💨

### A-3. 대파 소고기 국밥 (②직접제조 밀키트)

Title: 고기 듬뿍! 대파소고기국밥 7천원대✨

시원-한 국물에 차돌양지가 듬뿍!
대파, 무까지 같이 떠서 먹으면 캬..👍

초딩부터 어른까지 호불호 없는
이게 바로 갱상도식 소고기 뭇국이거든요😋

고퀄리티에 라면보다 만들기 쉬우니까
먹고나서 더 시켜둘걸..! 후회마시고
세일할 때 쟁여두는 거 추천드려요..❤️

오늘 밤 9시까지 주문하면 내일 도착!
주말 해장은 갓성비로 챙겨드실 수 있어요
지금 바로 최저가로 확인해보세요!

### A-4. 투쁠한우 마늘구이 (③직접매입 밀키트)

Title: [10% 할인쿠폰] 투뿔한우 양념 마늘구이 세일해봄🌸

투뿔 한우를 이 가격에..?
지난 특가 때 품절됐던 👉🏻한우마늘갈비
할인에 쿠폰적용까지 가능해요‼

진짜 인생 마늘양념구이 찾으신다면?
바로 무조건 이겁니다!
투쁠 한우 300g + 국내산 마늘 듬뿍
+ 수제소스 풀구성๑´ ³)ﾉ

한국인이라면 무.조.건 좋아할 맛💕
이번 특가도 품절되기 전에 놓치지말고
지금 바로 최저가에 주문하세요!

### A-5. 신제품 런칭 (②직접제조 밀키트)

Title: 📢 당장 이번주에 꼭! 드셔야 해요! 🍅

지금이 제-일 맛있는 제철 코어 가득
신상 10종 특가 안내드립니다. ✨

단짠단짠 품질 보장 짭짤이토마토
오늘 수확한 싱싱한 미더덕회부터

집에서 푸짐하게 즐기기 딱 좋은
신상 밀키트까지 무려 10종 할인🔥

특히 제철 과일, 해산물 품질은
백년밥상만한 데 없는 거 아시죠!?

워낙 귀한 시즌이라
품절 시 재입고는 없을 예정이에요..
꼬옥 할인할 때 데려가셔요 🥺

단 일주일 특가, 지금 바로 주문하면
내일 받아보실 수 있어요! ❤️

[신메뉴 특가 바로보기]

---

## B. 등급별 혜택형 (4개)

> 특징: {회원이름}님 호칭 / 등급별 차별화 / 시즌 감성 / 쿠폰 금액 강조
> 하위등급 = 업그레이드 유도 / 상위등급 = 감사·보답

### B-1. 손님 등급

Title: 🌼5월 혜택! 봄바람 타고 9,000원 선물 도착

완연한 봄날씨 기분 낼 맛있는 메뉴들!
더 기분좋게 구매하시라고
{회원이름}님께 등급혜택 보내드려요🌿
📌 이번 달 손님 등급 혜택
- 매달 할인쿠폰 3장 (총 9,000원)
- 5% 할인쿠폰 1장
- 구매 시 0.5% 적립
- 39,900원 / 69,900원 이상 무료 배송
👆 안 쓰면 그냥 사라지는 혜택
쿠폰함에서 지금 바로 확인해주세요!
━━━━━━━━━━━━
이번 달 5만원만 결제하면 다음 달은
혜택이 더 큰 단골등급으로 UPGRADE!
13,000원 쿠폰 + 7% 할인쿠폰이 기다려요!
[쿠폰 확인하기]

### B-2. 단골 등급

Title: 💌5월 쿠폰 13,000원 도착! 백년밥상 단골 {회원이름}님❤

완연한 봄날씨 기분 좋게 시작하시라고
봄맞이 혜택 가득 넣어드렸어요 🎉
{회원이름}님은 5월 백년밥상 단골 등급이에요 🌿
📌백년밥상 단골만의 혜택
- 매달 할인 쿠폰 3장 (총 13,000원)
- 7% 할인 쿠폰 1장
- 상시 적립 0.7%
- 39,900원 / 69,900원 이상 무료 배송
- 추가 깜짝쿠폰 랜덤발급 예정
👆 5월 쿠폰 모두 지급 완료!
사라지기 전에 얼른 사용해보세요.
━━━━━━━━━━━━
다음 등급인 백년밥상 VIP가 되면,
24,000원 쿠폰과 10% 쿠폰과
추가 시크릿 쿠폰까지 지급해드려요 💌
[쿠폰 확인하기]

### B-3. VIP 등급

Title: 5월 백년밥상 VIP 고객님만을 위한! 24,000원 쿠폰 도착🔥

봄이 절정인 5월,
{회원이름}님은 백년밥상 VIP세요💜
🍀 백년밥상 VIP 전용 혜택
- 매달 할인쿠폰 5장 (총 24,000원)
- 10% 할인쿠폰 1장
- 상시 적립 1%
- 39,900원 / 69,900원 이상 무료배송
(+) VIP전용 깜짝쿠폰 랜덤발급 예정💥
👆 5월 쿠폰 모두 지급 완료!
지금 바로 확인해보세요!
━━━━━━━━━━━━
다음 등급인 백년밥상 VVIP가 되면,
다음 달은 41,000원 쿠폰과 15% 쿠폰,
추가 시크릿 쿠폰까지 지급해드려요 💌
더 많은 혜택과 질 좋은 메뉴로 보답할게요!
최선을 다하는 5월의 백년밥상 드림
[쿠폰 확인하기]

### B-4. VVIP 등급

Title: 👑 최고등급 백년밥상 VVIP 전용 41,000원 + 15% 쿠폰 도착!

한층 포근해진 5월,
입맛도는 계절엔 역시 백년밥상이죠🫶
5월 {회원이름}님은 최.고.등.급
백년밥상 VVIP로 최대혜택을 받아보실 수 있어요 👑
🍀 백년밥상 VVIP 전용 혜택
- 매달 할인쿠폰 8장 (총 41,000원)
- 15% 할인쿠폰 1장
- 상시 적립 1.5%
- 39,900원 / 69,900원 이상 무료배송
(+) VVIP전용 깜짝쿠폰 랜덤발급 예정💥
👆 5월 쿠폰 모두 지급 완료!
지금 바로 확인해보세요!
━━━━━━━━━━━━
{회원이름}님의 한결같은 성원에 진심으로 감사드려요 💜
더 특별한 혜택과 질 좋은 메뉴로 보답할게요!
진심이 담긴 식탁을 채우고픈 백년밥상 드림
[쿠폰 확인하기]

---

## C. 복수 제품 추천형 (4개)

> 특징: 상황별 그루핑 / 시즌·날씨·TPO 기반 / 여러 제품 자연스러운 소개

### C-1. 국물 추천 (날씨 후킹)

Title: 🚨속보! 뜨끈-한 국물 먹을 날씨 연이어…

오늘부터 체감온도 영하 10도 이하🥶
이럴 땐 속끝까지 뜨끈해지는
국물요리가 더- 맛있고 든든하거든요🔥

얼큰~한 동태탕,
고기랑 곱이 넘치는 곱창전골,
스지과 바지락이 한가득! 스지바지락전골까지!

말고도 눈 돌아가는 국물메뉴가 한가득 @_@
이번 추위.. 하나씩 맛볼 수 있어서 오히려좋아!?

오늘 오후 3시까지 주문하면 내일도착!
지금 바로 국물요리 둘러보세요 🛒

### C-2. 해장템 추천 (시즌 후킹)

Title: (내일도착) 연말 필수 해장템 TOP 3

연말 모임 많은 시즌,
한 입만 먹어도 속 시원-하게 풀릴
국물요리 추천드릴게요 🎁

1️⃣ 속풀리는 김치 콩나물국밥
2️⃣ 고기가득 순대&고기 국밥
3️⃣ 얼큰한 우삼겹 짬뽕국밥

밤 9시 전에 주문해두면 주말 내내 든든할걸요🔥❤️

[TOP3 해장템 바로가기]

### C-3. 냉장 밀키트 특가 (한정수량)

Title: [한정 수량] 신선 냉장 밀키트 ~66% 특가💥

어제 진행한 한우 투쁠 마늘구이가.. 🥹
전량 품절로 마감되어서 오늘은 통 크-게
신선 냉장 밀키트 5종 가져왔습니다! 🫶

이번 냉장 밀키트는 오늘 할인 이후에
당분간 할인 & 추가 판매 예정이 없어요!

찐 한정 메뉴로 가져온 할인 제품 라인업
지금 바로 확인해보세요🔻

✔️막걸리 땡기는 바삭한 해물 파전
✔️신선도 최강! 새우 알곤탕
✔️생 바지락+불맛 조합, 짬뽕 순두부
✔️바지락 먹다 배터져도 모를 술찜 파스타
✔️대구 명물 납작만두 + 골뱅이 무침

[오늘 특가 바로가기]

### C-4. 주말 BEST 추천

Title: 🚨오늘밤 9시 넘기면 주말에 못 받아요!

이번 주말도 날씨 완-전 좋은데..! ☀️
가족, 친구들이랑 맛있는 거 가득 드셔야죠~?

💛 대황금 연휴였던 2주간
가장 많이 선택받은 메뉴 총 정리해드려요!

놀러가서 바베큐하며 먹기 딱! 좋은
👉🏻수제꼬치, 꼬리껍데기, 손말이고기
여전히 뜨끈한 국물이 땡길 땐
🫶🏻 4천원대 국밥부터 스지 바지락 전골!
집에서 고오급으로 즐기는 간편 안주
🍢 오뎅꼬치, 꼬리족발, 콘치즈

날씨 좋-은 주말 전 마지막 기회!
오늘 밤 9시 전 주문하면 내일 도착해요 🚚

(5월 쿠폰까지 쓰면 더 싸요..💨)

[베스트 상품 보러가기]

---

## D. 시즌/후킹형 (5개)

> 특징: 시즌·이벤트·트렌드 활용 / 짧은 후킹 / 호기심 유발

### D-1. 크리스마스 후킹

Title: 혹시.. P세요...?

파워 P 고객님들에게 주어진 마지막 기회 🎁

아직 크리스마스 때 뭐먹을지 못정했다면?!
오늘이 진짜! 마지막 기회예요

밤 9시 전 주문하면
내일 문앞에서 기다릴게요🚀

[ 크리스마스 준비하기 ]

### D-2. 연말 분위기

Title: 연말에 한 번이라도 차려먹을 생각이라면!

바쁜 월요일 앞둔 지금이 주문타이밍!
지금 해두고 연말 음식은 준비 끝 (｡•̀ᴗ-)✧

누가해도 맛있고 간편한 메뉴들로
연말 분위기 책임질게요 🎉

재구매율 높은 메뉴들만
지금 바로 만나보세요 🔻

[연말 인기메뉴 훔쳐보기]

### D-3. 연휴 택배 마감

Title: 연휴 택배 곧 마감🚨 지금 주문하면 내일 도착🚚

저번 연휴때 마감시간 놓쳐서
와이프한테 3일내내 잔소리 들었습니다..

오늘이 진짜! 마지막 기회에요😭
이번엔 냉동실 든든하게 채워두고
연휴 내내 집밥 걱정 없이 편하게 즐겨보자구요♪(^∇^*)

p.s. 제발.. 놓치지 마세요..

[지금주문 내일도착]

### D-4. 겨울방학 모음

Title: 이번 겨울 꼭 먹어야 하는 모음 zip

백밥 고객님이라면, 무조-건 좋아할
겨울 방학 밀키트 모음전 ✨

달콤한 아이들 간식부터
따뜻하게 즐기는 오뎅꼬치까지!

기간 한정 쿠폰 넣어드렸으니
얼-른 쟁여두러 가셔야 할껄요…!?

오늘 밤 9시 전 주문하면
내일 바로 만나볼 수 있어요🚀

[ 한정쿠폰 사용하기 ]

### D-5. 대학전쟁3 트렌드

Title: 명문대생들이 싹 비운 두뇌 회전식?!

최상위 1%의 두뇌 예능 대학전쟁3,
서바이벌 도중 이건 끝까지 먹어야한다며
그릇까지 싹-비운 그 메뉴가 밀키트로?! 🫢

엘리트들이 감탄한 콜라보 제품
지금 바로 확인해보세요! 🔻

[대학전쟁3 콜라보 메뉴]

---

## 톤 공통 패턴 (간략 참조)

| 패턴 | 설명 |
|------|------|
| 친구 추천 말투 | 종결어미 다양 (~거든요, ~이죠, ~입니다 혼용) |
| 구어체 강세 | 점 구분(진.짜.), 하이픈 늘림(시원-하게, 더-), ㅋㅋ/ㅠㅠ |
| 짧은 리듬 | 한 줄 15~25자, 3~4줄 블록 |
| 이모지 구분자 | 제품별 이모지(🦐🫕🥩) 또는 ✔️ 리스트 |
| 1인칭 공감 | 직원 경험, 솔직한 감탄 |
| 긴급 클로징 | 마지막 2~3줄에서 행동 유도 |
| CTA 버튼 | [ ] 대괄호 안에 행동 유도 문구 |
```
