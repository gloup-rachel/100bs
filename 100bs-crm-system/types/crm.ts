// 백년밥상 CRM 메세지 작성 시스템 타입 정의 (스펙 v1.0 §2-2 기반)

export type ProductCategory = "산지직배송" | "직접제조" | "직접매입";
export type CRMType =
  | "A_단일프로모션"
  | "B_등급별혜택"
  | "C_복수제품추천"
  | "D_시즌후킹";
export type Channel = "카톡" | "문자";
export type TargetSegment = "전체" | "등급별" | "세그먼트별";

export interface CRMInput {
  product: string;
  category: ProductCategory;
  sendDate: string;        // YYYY-MM-DD
  sendTime: string;        // HH:MM (자동 계산)
  channel: Channel;
  discount: {
    hasDiscount: boolean;
    originalPrice?: number;
    salePrice?: number;
    couponInfo?: string;
  };
  crmType: CRMType;
  targetSegment: TargetSegment;
  landingUrl: string;
  notionPageUrl?: string;
  additionalContext?: string;
}

export interface IdeationResult {
  productInfo: {
    name: string;
    category: string;
    originalPrice: number | null;
    salePrice: number | null;
    composition: string;
    uniqueBenefit: string;
  };
  psychologyAnalysis: {
    priceRange: string;
    customerMind: string;
    appealStrategy: string;
    decisionTreeResult: string;
    doNot: string;
  };
  reviewHighlights: {
    taste: string[];
    value: string[];
    repurchase: string[];
    recommend: string[];
  };
  appealPoints: string[];          // TOP 5
  titleDirection: {
    direction: string;
    tone: string;
    toneGuideRef: string;
  };
  raw: string;                     // Claude 원문 응답
}

export interface MaterialResult {
  titleOptions: Array<{
    type: "가격임팩트형" | "긴급성형" | "경험소환형";
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
    strategy: string;
    comparison: string;
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
  toneReference: string[];
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
}

export interface FinalMessage {
  title: string;
  body: string;
  cta: string;
}

export interface ValidationResult {
  titleCharCount: number;
  ctaCharCount: number;
  bodyLineCount: number;
  emDashFound: boolean;
  ctaOver12: boolean;
  bodyOver13: boolean;
  checkboxWarning: boolean;
  tierCheck: boolean;
  utmUrl: string;
  sendTime: string;
  allPassed: boolean;
}

export interface ImageDirection {
  mainVisual: string;
  colorScheme: string;
  typography: string;
  ctaButton: string;
  layoutSuggestion: string;
  seasonalMotif: string;
}

export type WizardStep = 0 | 1 | 2 | 2.5 | 3 | 4;

export interface CRMSession {
  input: CRMInput;
  ideation: IdeationResult | null;
  material: MaterialResult | null;
  finalMessage: FinalMessage | null;
  validationResult: ValidationResult | null;
  imageDirection: ImageDirection | null;
  currentStep: WizardStep;
}

// ─────────── API Request/Response ───────────

export interface IdeationRequest {
  input: CRMInput;
  reviewData?: string;
  notionData?: string;
  duplicateCheck?: {
    found: boolean;
    recentTitles: string[];
  };
}

export interface IdeationResponse {
  success: boolean;
  ideation: IdeationResult;
  duplicateWarning?: {
    found: boolean;
    recentTitles: string[];
    suggestion: string;
  };
  error?: string;
}

export interface MaterialRequest {
  input: CRMInput;
  ideation: IdeationResult;
}

export interface MaterialResponse {
  success: boolean;
  material: MaterialResult;
  error?: string;
}

export interface ValidateRequest {
  finalMessage: FinalMessage;
  input: CRMInput;
}

export interface ValidateResponse {
  success: boolean;
  validationResult: ValidationResult;
  error?: string;
}

export interface ImageDirectionRequest {
  input: CRMInput;
  finalMessage: FinalMessage;
  ideation: IdeationResult;
}

export interface ImageDirectionResponse {
  success: boolean;
  imageDirection: ImageDirection;
  error?: string;
}

export interface PublishRequest {
  session: CRMSession;
}

export interface PublishResponse {
  success: boolean;
  sheetsResult?: {
    rowsAdded: number;
    sheetUrl?: string;
  };
  error?: string;
}

// ─────────── Reviews ───────────

export interface ReviewData {
  product: string;
  reviewer: string;
  rating: number;
  content: string;
  category: string;
  date: string;
  source: string;
}

export interface ReviewSearchResponse {
  success: boolean;
  reviews: ReviewData[];
  total: number;
  error?: string;
}

export interface ReviewUploadResponse {
  success: boolean;
  added: number;
  total: number;
  error?: string;
}
