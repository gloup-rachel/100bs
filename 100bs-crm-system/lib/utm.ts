// UTM 자동 생성 (스펙 §STEP 2.5)

import type { CRMType } from "@/types/crm";

function makeUtmTerm(productName: string): string {
  // 공백→_ 변환, 특수문자 제거. 한글은 보존(GA에서 자동 디코드).
  // URL 생성 시 encodeURIComponent로 안전하게 직렬화한다.
  return (
    productName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_가-힣]/g, "") || "product"
  );
}

export function generateUTM(
  baseUrl: string,
  crmType: CRMType,
  productName: string
): string {
  if (!baseUrl) return "";
  // 이미 UTM 포함된 URL이면 그대로 반환
  if (baseUrl.includes("utm_source=")) return baseUrl;

  const utmContent = crmType === "B_등급별혜택" ? "membership" : "sales";
  const utmTerm = makeUtmTerm(productName);

  const params = new URLSearchParams({
    utm_source: "kakao",
    utm_medium: "crm",
    utm_campaign: "RT",
    utm_content: utmContent,
    utm_term: utmTerm,
  });

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${params.toString()}`;
}
