// STEP 3: 이미지 기획 방향 (스펙 §STEP 3)
// POST /api/crm/image-direction

import { NextResponse } from "next/server";
import type {
  ImageDirectionRequest,
  ImageDirectionResponse,
  ImageDirection,
} from "@/types/crm";
import { callClaudeJSON } from "@/lib/claude";
import {
  SYSTEM_PROMPT_IMAGE_DIRECTION,
  buildImageDirectionUserMessage,
} from "@/lib/prompts/image-direction";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request
): Promise<NextResponse<ImageDirectionResponse>> {
  try {
    const body = (await request.json()) as ImageDirectionRequest;

    const { data } = await callClaudeJSON<ImageDirection>({
      system: SYSTEM_PROMPT_IMAGE_DIRECTION,
      userMessage: buildImageDirectionUserMessage(
        body.input,
        body.finalMessage,
        body.ideation
      ),
      maxTokens: 2048,
    });

    return NextResponse.json({ success: true, imageDirection: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        imageDirection: {} as ImageDirection,
        error: message,
      },
      { status: 500 }
    );
  }
}
