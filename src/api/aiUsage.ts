import { buildApiUrl } from '../config/api'

/** AI(OpenAI) 호출 한 건. cost_usd는 호출 당시 설정 단가로 계산한 예상 비용 */
export type AiUsageRow = {
  ai_usage_log_id: number
  feature: string
  account_id: string | null
  account_name: string | null
  user_id: string | null
  model: string
  item_count: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cost_usd: number
  status: 'SUCCESS' | 'FAILED'
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

export type AiUsageSummary = {
  feature: string
  call_count: number
  item_count: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cost_usd: number
  failed_count: number
}

export type AiUsageReport = {
  from: string
  to: string
  rows: AiUsageRow[]
  summary: AiUsageSummary[]
  today_cost_usd: number
  daily_limit_usd: string
  price_per_1m: { input: string; cached_input: string; output: string }
}

/** AI 사용 이력(본사 전용). 기간 기본값은 이번 달 */
export async function getAiUsage(params: { from?: string; to?: string; account_id?: string }): Promise<AiUsageReport> {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as Array<[string, string]>)
  const response = await fetch(buildApiUrl(`/v2/ai-usage?${query}`))
  const payload = await response.json().catch(() => null) as (AiUsageReport & { message?: string }) | null
  if (!response.ok || !payload || !Array.isArray(payload.rows)) throw new Error(payload?.message || 'AI 사용 이력을 불러오지 못했습니다.')
  const num = (value: unknown) => Number(value ?? 0)
  return {
    ...payload,
    today_cost_usd: num(payload.today_cost_usd),
    rows: payload.rows.map(row => ({ ...row, cost_usd: num(row.cost_usd) })),
    summary: payload.summary.map(item => ({ ...item, call_count: num(item.call_count), item_count: num(item.item_count), input_tokens: num(item.input_tokens), cached_input_tokens: num(item.cached_input_tokens), output_tokens: num(item.output_tokens), reasoning_tokens: num(item.reasoning_tokens), cost_usd: num(item.cost_usd), failed_count: num(item.failed_count) })),
  }
}

export const AI_FEATURE_LABELS: Record<string, string> = {
  MENU_RECIPE_DRAFT: '미등록 메뉴 레시피 초안',
  RECIPE_GENERATE: '조리법 생성',
}
