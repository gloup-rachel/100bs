// Google Sheets API 래퍼 — 후기 DB 검색/업로드 (스펙 §4)

import { google, type sheets_v4 } from "googleapis";
import type { ReviewData } from "@/types/crm";

const REVIEW_RANGE_COLUMNS = "A:G";

let cachedClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 환경변수가 설정되지 않았습니다."
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

function getReviewSheetConfig(): { sheetId: string; tab: string } {
  const sheetId = process.env.REVIEW_SHEET_ID;
  const tab = process.env.REVIEW_SHEET_TAB || "후기DB";
  if (!sheetId) throw new Error("REVIEW_SHEET_ID 환경변수가 설정되지 않았습니다.");
  return { sheetId, tab };
}

function rowToReview(row: string[]): ReviewData {
  return {
    product: row[0] ?? "",
    reviewer: row[1] ?? "익명",
    rating: Number(row[2] ?? 0),
    content: row[3] ?? "",
    category: row[4] ?? "",
    date: row[5] ?? "",
    source: row[6] ?? "",
  };
}

function reviewToRow(r: ReviewData): (string | number)[] {
  return [
    r.product,
    r.reviewer,
    r.rating,
    r.content,
    r.category,
    r.date,
    r.source,
  ];
}

export async function searchReviews(
  productName: string
): Promise<ReviewData[]> {
  const sheets = getSheetsClient();
  const { sheetId, tab } = getReviewSheetConfig();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!${REVIEW_RANGE_COLUMNS}`,
  });

  const rows = response.data.values || [];
  // 첫 행은 헤더로 가정하고 스킵. 헤더가 없는 시트라면 인덱스 0부터 사용.
  const dataRows = rows.length > 0 && isHeaderRow(rows[0]) ? rows.slice(1) : rows;

  return dataRows
    .filter((row) => row[0]?.includes(productName))
    .map(rowToReview);
}

function isHeaderRow(row: string[]): boolean {
  const firstCell = (row[0] ?? "").trim();
  return firstCell === "제품명" || firstCell === "상품명";
}

export async function uploadReviews(reviews: ReviewData[]): Promise<{
  added: number;
  total: number;
}> {
  if (reviews.length === 0) return { added: 0, total: 0 };

  const sheets = getSheetsClient();
  const { sheetId, tab } = getReviewSheetConfig();

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!${REVIEW_RANGE_COLUMNS}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: reviews.map(reviewToRow),
    },
  });

  const totalResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A:A`,
  });
  const totalRows = (totalResponse.data.values || []).length;

  return { added: reviews.length, total: totalRows };
}

// 아이데이션 단계에서 사용 — 후기 텍스트를 한 덩어리로 합쳐 Claude 프롬프트에 주입
export function reviewsToPromptText(reviews: ReviewData[]): string {
  if (reviews.length === 0) return "(등록된 후기 없음)";
  return reviews
    .map(
      (r, i) =>
        `[${i + 1}] ${r.reviewer} (${r.rating}점, ${r.category})\n${r.content}`
    )
    .join("\n\n");
}
