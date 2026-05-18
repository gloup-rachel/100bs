// STEP 0~1: 아이데이션 생성 (스펙 §STEP 0~1)
// POST /api/crm/ideation

import { NextResponse } from "next/server";
import type {
  IdeationRequest,
  IdeationResponse,
  IdeationResult,
} from "@/types/crm";
import { callClaudeJSON } from "@/lib/claude";
import {
  SYSTEM_PROMPT_IDEATION,
  buildIdeationUserMessage,
} from "@/lib/prompts/ideation";
import { searchReviews, reviewsToPromptText } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ClaudeIdeationOutput {
  productInfo: IdeationResult["productInfo"];
  psychologyAnalysis: IdeationResult["psychologyAnalysis"];
  reviewHighlights: IdeationResult["reviewHighlights"];
  appealPointsTop5: string[];
  titleDirection: IdeationResult["titleDirection"];
}

export async function POST(request: Request): Promise<NextResponse<IdeationResponse>> {
  try {
    const body = (await request.json()) as IdeationRequest;

    // 후기 DB 조회 (서버사이드)
    let reviewData = body.reviewData;
    if (!reviewData) {
      try {
        const reviews = await searchReviews(body.input.product);
        reviewData = reviewsToPromptText(reviews);
      } catch (e) {
        // 후기 DB 미설정/조회 실패 시 진행 (Google 서비스 계정 미발급 상황 포함)
        reviewData = `(후기 DB 조회 실패: ${e instanceof Error ? e.message : "unknown"})`;
      }
    }

    const enrichedReq: IdeationRequest = { ...body, reviewData };

    const { data, raw } = await callClaudeJSON<ClaudeIdeationOutput>({
      system: SYSTEM_PROMPT_IDEATION,
      userMessage: buildIdeationUserMessage(enrichedReq),
      maxTokens: 4096,
    });

    const ideation: IdeationResult = {
      productInfo: data.productInfo,
      psychologyAnalysis: data.psychologyAnalysis,
      reviewHighlights: data.reviewHighlights,
      appealPoints: data.appealPointsTop5 ?? [],
      titleDirection: data.titleDirection,
      raw,
    };

    return NextResponse.json({
      success: true,
      ideation,
      duplicateWarning: body.duplicateCheck?.found
        ? {
            found: true,
            recentTitles: body.duplicateCheck.recentTitles,
            suggestion: "직전 발송 멘트와 후킹 방식이 겹치지 않도록 타이틀 방향을 검토하세요.",
          }
        : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        ideation: {} as IdeationResult,
        error: message,
      },
      { status: 500 }
    );
  }
}
