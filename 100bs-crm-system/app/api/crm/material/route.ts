// STEP 2: 재료 패키지 + 초안 생성 (스펙 §STEP 2)
// POST /api/crm/material

import { NextResponse } from "next/server";
import type {
  MaterialRequest,
  MaterialResponse,
  MaterialResult,
} from "@/types/crm";
import { callClaudeJSON } from "@/lib/claude";
import {
  SYSTEM_PROMPT_MATERIAL,
  buildMaterialUserMessage,
} from "@/lib/prompts/material";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse<MaterialResponse>> {
  try {
    const body = (await request.json()) as MaterialRequest;

    const { data } = await callClaudeJSON<MaterialResult>({
      system: SYSTEM_PROMPT_MATERIAL,
      userMessage: buildMaterialUserMessage(body.input, body.ideation),
      maxTokens: 4096,
    });

    return NextResponse.json({
      success: true,
      material: data,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        material: {} as MaterialResult,
        error: message,
      },
      { status: 500 }
    );
  }
}
