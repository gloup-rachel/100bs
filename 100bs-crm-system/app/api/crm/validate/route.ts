// STEP 2.5: 최종본 검증 (순수 로직, Claude API 불필요)
// POST /api/crm/validate

import { NextResponse } from "next/server";
import type {
  ValidateRequest,
  ValidateResponse,
  ValidationResult,
} from "@/types/crm";
import { validateFinalMessage } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<ValidateResponse>> {
  try {
    const body = (await request.json()) as ValidateRequest;
    const validationResult = validateFinalMessage(body.finalMessage, body.input);
    return NextResponse.json({ success: true, validationResult });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        validationResult: {} as ValidationResult,
        error: message,
      },
      { status: 400 }
    );
  }
}
