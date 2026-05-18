// 후기 DB 검색 (스펙 §4-2)
// GET /api/reviews/search?product=<제품명>

import { NextResponse } from "next/server";
import type { ReviewSearchResponse } from "@/types/crm";
import { searchReviews } from "@/lib/google-sheets";

export const runtime = "nodejs";

export async function GET(
  request: Request
): Promise<NextResponse<ReviewSearchResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const product = searchParams.get("product")?.trim();
    if (!product) {
      return NextResponse.json(
        {
          success: false,
          reviews: [],
          total: 0,
          error: "product 쿼리 파라미터가 필요합니다.",
        },
        { status: 400 }
      );
    }

    const reviews = await searchReviews(product);
    return NextResponse.json({
      success: true,
      reviews,
      total: reviews.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { success: false, reviews: [], total: 0, error: message },
      { status: 500 }
    );
  }
}
