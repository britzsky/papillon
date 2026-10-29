import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'

type HqAccount = { account_id: string; account_name: string }
export type HqOverview = {
  checked_at: string
  week_start: string
  week_end: string
  /** 목~일: 식단표 제작 필요를 세는 기간(월~수는 meal_plan_needed가 빈 목록) */
  meal_plan_due: boolean
  /** 금~일: 목요일 마감이 지남 */
  meal_plan_late: boolean
  meal_plan_needed: HqAccount[]
  /** items가 null이면 계산 실패(레시피 없는 메뉴 등) — error에 이유 */
  order_needed: (HqAccount & { items: number | null; error?: string })[]
  hygiene_open: (HqAccount & { open_count: number })[]
}

/** 본사 홈 '오늘 할 일' 집계: GET /v2/workspace/hq-overview(account가 있으면 그 거래처만). enabled가 false면 부르지 않는다(현장 계정). */
export function useHqOverview(enabled: boolean, account: string, revision: number) {
  // 결과에 조회 조건(거래처·새로고침 차례)을 붙여 두고, 지금 조건의 결과가 아니면 아직 확인 중으로 본다
  const key = `${account}:${revision}`
  const [result, setResult] = useState<{ key: string; data: HqOverview | null; error: string } | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void fetch(buildApiUrl(`/v2/workspace/hq-overview?${new URLSearchParams({ account_id: account })}`), { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('본사 업무 현황을 불러오지 못했습니다.'); return response.json() as Promise<HqOverview> })
      .then(value => { if (!controller.signal.aborted) setResult({ key, data: value, error: '' }) })
      .catch((e: unknown) => { if (!controller.signal.aborted && !(e instanceof DOMException && e.name === 'AbortError')) setResult({ key, data: null, error: e instanceof Error ? e.message : '조회 실패' }) })
    return () => controller.abort()
  }, [enabled, account, key])
  const current = enabled && result?.key === key ? result : null
  return { data: current?.data ?? null, error: current?.error ?? '' }
}
