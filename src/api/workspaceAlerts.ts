import { buildApiUrl } from '../config/api'

/** 다음 주 식단표 미작성(목요일부터). 서버 MealPlanAlertService. */
export type MealPlanAlert = {
  type: 'MEAL_NEXT_WEEK'
  key: string
  level: 'warn' | 'urgent'
  account_id: string
  account_name: string
  title: string
  detail: string
  week_start: string
  path: string
}

const CACHE_MS = 5 * 60_000
const cache = new Map<string, { at: number; result: Promise<MealPlanAlert[]> }>()

/** 거래처를 비우면(본사) 전체 거래처. 화면 이동마다 머리글이 다시 그려지므로 5분 동안 결과를 재사용한다. */
export function getMealPlanAlertsCached(accountId: string): Promise<MealPlanAlert[]> {
  const hit = cache.get(accountId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result
  const result = fetch(buildApiUrl(`/v2/workspace/alerts?${new URLSearchParams({ account_id: accountId })}`))
    .then(async response => {
      const body = await response.json().catch(() => null)
      if (!response.ok || !body) throw new Error(body?.message || '알림을 확인하지 못했습니다.')
      // 이전 서버(엔드포인트 없음) 등 예상과 다른 응답이면 빈 목록
      return Array.isArray(body.alerts) ? body.alerts.filter((a: Partial<MealPlanAlert>) => a && typeof a.title === 'string') as MealPlanAlert[] : []
    })
  cache.set(accountId, { at: Date.now(), result })
  result.catch(() => cache.delete(accountId))
  return result
}
