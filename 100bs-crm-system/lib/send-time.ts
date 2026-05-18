// 발송시간 자동 계산 (스펙 §STEP 0)
// 평일(월~금) → 08:30 / 주말(토~일) → 11:00

export function getSendTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "08:30";
  const day = date.getDay(); // 0=일, 6=토
  return day === 0 || day === 6 ? "11:00" : "08:30";
}
