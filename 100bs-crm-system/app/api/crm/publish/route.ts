// STEP 4: 시스템 반영 (Google Sheets via Apps Script) — 스펙 §STEP 4
// POST /api/crm/publish

import { NextResponse } from "next/server";
import type { PublishRequest, PublishResponse } from "@/types/crm";
import { postToAppsScript } from "@/lib/apps-script";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request
): Promise<NextResponse<PublishResponse>> {
  try {
    const body = (await request.json()) as PublishRequest;

    const result = await postToAppsScript(body.session);
    const sheetId = process.env.CRM_SHEET_ID;
    const sheetUrl = sheetId
      ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
      : undefined;

    return NextResponse.json({
      success: true,
      sheetsResult: {
        rowsAdded: result.rowsAdded ?? 1,
        sheetUrl,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
