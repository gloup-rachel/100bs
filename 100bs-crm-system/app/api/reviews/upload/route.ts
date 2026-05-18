// 후기 데이터 업로드 (스펙 §4-3)
// POST /api/reviews/upload  (multipart/form-data, field name: "file")
// 지원 포맷: .xlsx, .xls, .csv

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import type { ReviewData, ReviewUploadResponse } from "@/types/crm";
import { uploadReviews } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

const COLUMN_MAP: Record<keyof ReviewData, string[]> = {
  product: ["제품명", "상품명", "product"],
  reviewer: ["리뷰어", "작성자", "닉네임", "reviewer"],
  rating: ["평점", "별점", "rating"],
  content: ["리뷰본문", "후기", "내용", "content"],
  category: ["카테고리", "category"],
  date: ["등록일", "작성일", "date"],
  source: ["소스", "출처", "source"],
};

function pickField<T = string>(
  row: Record<string, unknown>,
  keys: string[],
  fallback: T
): T | string {
  for (const key of keys) {
    const found = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === key.trim().toLowerCase()
    );
    if (found && row[found] !== undefined && row[found] !== null) {
      return String(row[found]);
    }
  }
  return fallback;
}

function parseFileBuffer(
  buffer: ArrayBuffer,
  fileName: string
): ReviewData[] {
  const isCSV = fileName.toLowerCase().endsWith(".csv");
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });

  return rows.map((row) => ({
    product: String(pickField(row, COLUMN_MAP.product, "")),
    reviewer: String(pickField(row, COLUMN_MAP.reviewer, "익명")),
    rating: Number(pickField(row, COLUMN_MAP.rating, "0")) || 0,
    content: String(pickField(row, COLUMN_MAP.content, "")),
    category: String(pickField(row, COLUMN_MAP.category, "")),
    date: String(pickField(row, COLUMN_MAP.date, "")),
    source: String(pickField(row, COLUMN_MAP.source, isCSV ? "직접입력" : "업로드")),
  })).filter((r) => r.product && r.content);
}

export async function POST(
  request: Request
): Promise<NextResponse<ReviewUploadResponse>> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, added: 0, total: 0, error: "파일이 첨부되지 않았습니다." },
        { status: 400 }
      );
    }

    const fileName = (file as File).name;
    const ext = fileName.toLowerCase().split(".").pop();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      return NextResponse.json(
        {
          success: false,
          added: 0,
          total: 0,
          error: "지원 포맷이 아닙니다. (.xlsx / .xls / .csv)",
        },
        { status: 400 }
      );
    }

    const buffer = await (file as File).arrayBuffer();
    const reviews = parseFileBuffer(buffer, fileName);

    if (reviews.length === 0) {
      return NextResponse.json(
        {
          success: false,
          added: 0,
          total: 0,
          error: "유효한 후기 행이 없습니다. 컬럼명(제품명/리뷰본문 등)을 확인해주세요.",
        },
        { status: 400 }
      );
    }

    const result = await uploadReviews(reviews);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { success: false, added: 0, total: 0, error: message },
      { status: 500 }
    );
  }
}
