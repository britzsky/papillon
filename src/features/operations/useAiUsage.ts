import { useEffect, useMemo, useState } from 'react'
import { getAiUsage, type AiUsageReport } from '../../api/aiUsage'

/** 원화 환산용 환율(대략). 실제 청구는 OpenAI 사용량 화면의 달러 금액이 기준 */
export const KRW_PER_USD = 1400

export type AiUsagePeriod = 'this-month' | 'last-month' | 'last-7'

const pad = (value: number) => String(value).padStart(2, '0')
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

function range(period: AiUsagePeriod) {
  const today = new Date()
  if (period === 'last-7') return { from: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), to: ymd(today) }
  if (period === 'last-month') return { from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)) }
  return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) }
}

export const formatUsd = (value: number) => `$${value.toFixed(value >= 1 ? 2 : 4)}`
export const formatKrw = (usd: number) => `약 ${Math.round(usd * KRW_PER_USD).toLocaleString('ko-KR')}원`
export const formatTokens = (value: number) => value.toLocaleString('ko-KR')

export const AI_USAGE_PERIODS: Array<[AiUsagePeriod, string]> = [['this-month', '이번 달'], ['last-month', '지난 달'], ['last-7', '최근 7일']]

/** AI 사용 이력(PC·터치 공용): 기간 고르기 → 기능별 합계·호출 목록. 본사 전용 */
export function useAiUsage() {
  const [period, setPeriod] = useState<AiUsagePeriod>('this-month')
  const [accountId, setAccountId] = useState('')
  const [result, setResult] = useState<{ key: string; report: AiUsageReport | null; error: string }>({ key: '', report: null, error: '' })
  /** 이력에 나온 거래처(거르기 목록). 거래처를 고른 뒤에도 목록이 줄지 않게 전체 조회 때만 갱신한다 */
  const [accounts, setAccounts] = useState<Array<[string, string]>>([])
  const requestKey = `${period}/${accountId}`

  useEffect(() => {
    let active = true
    getAiUsage({ ...range(period), account_id: accountId })
      .then(report => {
        if (!active) return
        setResult({ key: requestKey, report, error: '' })
        if (accountId) return
        const map = new Map<string, string>()
        report.rows.forEach(row => { if (row.account_id) map.set(row.account_id, row.account_name || row.account_id) })
        setAccounts([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])))
      })
      .catch(e => { if (active) setResult(current => ({ ...current, key: requestKey, error: e instanceof Error ? e.message : 'AI 사용 이력을 불러오지 못했습니다.' })) })
    return () => { active = false }
  }, [period, accountId, requestKey])

  const report = result.report
  const loading = result.key !== requestKey
  const totals = useMemo(() => (report?.summary ?? []).reduce(
    (sum, item) => ({
      calls: sum.calls + item.call_count,
      items: sum.items + item.item_count,
      input: sum.input + item.input_tokens,
      output: sum.output + item.output_tokens,
      reasoning: sum.reasoning + item.reasoning_tokens,
      cost: sum.cost + item.cost_usd,
      failed: sum.failed + item.failed_count,
    }),
    { calls: 0, items: 0, input: 0, output: 0, reasoning: 0, cost: 0, failed: 0 },
  ), [report])

  const dailyLimit = Number(report?.daily_limit_usd ?? 0)
  return { period, setPeriod, accountId, setAccountId, report, error: result.error, loading, totals, accounts, dailyLimit }
}
