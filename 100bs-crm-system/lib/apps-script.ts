// Google Apps Script POST 래퍼 (스펙 §STEP 4-A)
// ⚠️ 핵심 규칙:
//   1. 상태 값은 반드시 "피드백 요청" 고정
//   2. Content-Type: text/plain;charset=utf-8 (application/json → CORS 에러)
//   3. payload 구조: { rows: [{ ... }] } 배열 형태

import type { CRMSession } from "@/types/crm";

interface AppsScriptRow {
  발송일자: string;
  발송시간: string;
  상태: "피드백 요청";
  발송매체: string;
  연계프로모션: string;
  주력상품: string;
  소구점: string;
  타이틀: string;
  타이틀글자수: number;
  멘트: string;
  CTA: string;
  CTA글자수: number;
  이미지: string;
  랜딩URL: string;
}

interface AppsScriptPayload {
  rows: AppsScriptRow[];
}

interface AppsScriptResponse {
  ok?: boolean;
  message?: string;
  rowsAdded?: number;
  [key: string]: unknown;
}

export function buildAppsScriptRow(session: CRMSession): AppsScriptRow {
  const { input, finalMessage, validationResult, ideation, imageDirection } =
    session;

  if (!finalMessage || !validationResult || !ideation) {
    throw new Error(
      "Apps Script POST 실패: finalMessage / validationResult / ideation 미완료"
    );
  }

  return {
    발송일자: input.sendDate,
    발송시간: validationResult.sendTime,
    상태: "피드백 요청",
    발송매체: input.channel,
    연계프로모션: input.discount.couponInfo || "-",
    주력상품: input.product,
    소구점: ideation.appealPoints.join(", "),
    타이틀: finalMessage.title,
    타이틀글자수: validationResult.titleCharCount,
    멘트: finalMessage.body,
    CTA: finalMessage.cta,
    CTA글자수: validationResult.ctaCharCount,
    이미지: imageDirection?.mainVisual ?? "",
    랜딩URL: validationResult.utmUrl,
  };
}

export async function postToAppsScript(
  session: CRMSession
): Promise<AppsScriptResponse> {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) throw new Error("APPS_SCRIPT_URL 환경변수가 설정되지 않았습니다.");

  const payload: AppsScriptPayload = {
    rows: [buildAppsScriptRow(session)],
  };

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "text/plain;charset=utf-8" },
  });

  if (!response.ok) {
    throw new Error(
      `Apps Script POST 실패: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as AppsScriptResponse;
}
