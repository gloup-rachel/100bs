// 최종본 검증 — 글자수 / 5대 절대 금지 / 등급별 멘트 (스펙 §STEP 2.5)

import type {
  CRMInput,
  FinalMessage,
  ValidationResult,
} from "@/types/crm";
import { generateUTM } from "./utm";
import { getSendTime } from "./send-time";

const TIER_KEYWORDS = ["손님", "단골", "VIP", "VVIP"] as const;

export function validateFinalMessage(
  finalMessage: FinalMessage,
  input: CRMInput
): ValidationResult {
  const { title, body, cta } = finalMessage;
  const { sendDate, landingUrl, crmType, product } = input;

  const titleCharCount = [...title].length;
  const ctaCharCount = [...cta].length;
  const bodyLines = body
    .split("\n")
    .filter((line) => line.trim() !== "").length;

  const emDashFound = body.includes("—") || title.includes("—");
  const ctaOver12 = ctaCharCount > 12;
  const bodyOver13 = bodyLines > 13;

  const checkboxLines = body
    .split("\n")
    .filter((line) => line.trim().startsWith("✅")).length;
  const checkboxWarning = checkboxLines >= 2;

  let tierCheck = true;
  if (crmType === "B_등급별혜택") {
    tierCheck = TIER_KEYWORDS.every((tier) => body.includes(tier));
  }

  const utmUrl = generateUTM(landingUrl, crmType, product);
  const sendTime = getSendTime(sendDate);

  const allPassed =
    !emDashFound &&
    !ctaOver12 &&
    !bodyOver13 &&
    !checkboxWarning &&
    tierCheck;

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
    allPassed,
  };
}
