// 공통 Claude API 클라이언트 + JSON 추출 헬퍼

import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export function getDefaultModel(): string {
  // 환경변수로 오버라이드 가능. 기본은 Sonnet 4.6 (비용·품질 균형)
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
}

export function extractTextFromResponse(
  response: Anthropic.Messages.Message
): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// Claude 응답에서 JSON 객체를 추출.
// 1) ```json ... ``` 코드블록 우선
// 2) 그 외엔 첫 '{' 부터 마지막 '}' 까지 슬라이스
export function extractJSON<T = unknown>(text: string): T {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = codeBlock ? codeBlock[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude 응답에서 JSON을 찾을 수 없습니다.\n원문:\n" + text);
  }
  const sliced = candidate.slice(start, end + 1);
  try {
    return JSON.parse(sliced) as T;
  } catch (e) {
    throw new Error(
      `JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}\n슬라이스:\n${sliced}`
    );
  }
}

export interface ClaudeCallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  model?: string;
}

export async function callClaudeJSON<T = unknown>(
  options: ClaudeCallOptions
): Promise<{ data: T; raw: string }> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: options.model || getDefaultModel(),
    max_tokens: options.maxTokens ?? 4096,
    system: options.system,
    messages: [{ role: "user", content: options.userMessage }],
  });
  const raw = extractTextFromResponse(response);
  const data = extractJSON<T>(raw);
  return { data, raw };
}
