import { buildApiUrl } from '../config/api'

export type DeadlineAlertItem = {
  ingredient_id: string
  ingredient_name: string
  product_name: string
  shortage_qty: number
  base_unit: string
  stock_status?: 'RED' | 'YELLOW' | 'GREEN'
  needed_by: string
  /** 필요일 납품분 마감이 이미 지나 가장 빠른 납품일로 잡힌 품목 */
  late: boolean
}

export type DeadlineAlert = {
  alert_key: string
  supplier_code: string
  supplier_name: string
  external_site_code: string
  external_site_name: string
  /** 한국시간 'YYYY-MM-DDTHH:mm' */
  deadline: string
  delivery_date: string
  minutes_left: number
  /** 예: "D-1 · 육류 11시 마감", "D-2 16:30" */
  rule: string
  items: DeadlineAlertItem[]
}

export type DeadlineAlertResult = { checked_at: string; within_hours: number; alerts: DeadlineAlert[] }

/** 저장된 식단 기준 부족 식재료의 발주 마감(공급사 가이드 규칙). 발주하면 부족량에서 빠져 목록에서 사라진다. */
export async function getDeadlineAlerts(accountId: string, withinHours = 24, signal?: AbortSignal): Promise<DeadlineAlertResult> {
  const query = new URLSearchParams({ account_id: accountId, within_hours: String(withinHours) })
  const response = await fetch(buildApiUrl(`/Procurement/DeadlineAlerts?${query}`), { signal })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(body?.message || '발주 마감 정보를 확인하지 못했습니다.')
  // 예상과 다른 응답(이전 서버, 프록시 오류 페이지 등)이어도 업무 화면이 깨지지 않게 빈 목록으로 본다
  const alerts = Array.isArray(body.alerts) ? body.alerts.filter((alert: Partial<DeadlineAlert>) => alert && typeof alert.deadline === 'string' && Array.isArray(alert.items)) : []
  return { checked_at: String(body.checked_at ?? ''), within_hours: Number(body.within_hours) || withinHours, alerts } as DeadlineAlertResult
}

const CACHE_MS = 5 * 60_000
const cache = new Map<string, { at: number; result: Promise<DeadlineAlertResult> }>()

/** 화면 이동마다 레이아웃이 다시 그려지므로 같은 거래처는 5분 동안 결과를 재사용한다(부족량 계산 반복 방지). */
export function getDeadlineAlertsCached(accountId: string, withinHours = 24): Promise<DeadlineAlertResult> {
  const key = `${accountId}:${withinHours}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result
  const result = getDeadlineAlerts(accountId, withinHours)
  cache.set(key, { at: Date.now(), result })
  result.catch(() => cache.delete(key))
  return result
}

/** 그 마감의 납품일로 식단표 기준 발주하기 탭을 연다(배너·종 알림·홈 공통). */
export function deadlineOrderPath(accountId: string, alert: Pick<DeadlineAlert, 'delivery_date'>) {
  // autoselect=1: 들어가면 바로 시킬 수 있는 품목이 미리 선택된다(마감 알림 → 발주서 확인 → 보내기)
  return `/order_manager/order?${new URLSearchParams({ tab: 'plan', account_id: accountId, source: 'PLAN', delivery_date: alert.delivery_date, autoselect: '1' })}`
}

/** 배너·종 알림·홈이 같은 결과를 쓰도록 맞춘 조회 범위(시간). 배너는 이 중 5시간 이내만 보여준다. */
export const DEADLINE_WINDOW_HOURS = 24

/** 발주 후 바로 다시 계산하도록 캐시를 비운다. */
export function clearDeadlineAlertCache() { cache.clear() }

/** 알림 시점(남은 분): 마감 5시간 전부터 1시간 간격, 마지막 1시간은 30분 간격 */
export const NOTIFY_MINUTES = [300, 240, 180, 120, 60, 30] as const

/**
 * 지금 울려야 할 알림 시점. 이미 지난 시점 중 가장 늦은(가까운) 것 하나만 돌려준다
 * (화면을 2시간 전에 처음 열면 5·4·3시간 알림을 몰아서 띄우지 않고 2시간 알림 하나만).
 */
export function dueThreshold(minutesLeft: number, fired: ReadonlySet<number>): number | null {
  if (minutesLeft <= 0) return null
  const passed = NOTIFY_MINUTES.filter(threshold => minutesLeft <= threshold)
  if (!passed.length) return null
  const latest = passed[passed.length - 1]
  return fired.has(latest) ? null : latest
}

/** 한국시간 마감까지 남은 분 (브라우저 시간대와 무관) */
export function minutesUntil(deadline: string, now = Date.now()) {
  const target = Date.parse(`${deadline.length === 16 ? `${deadline}:00` : deadline}+09:00`)
  return Number.isFinite(target) ? Math.floor((target - now) / 60000) : NaN
}

export function remainingLabel(minutes: number) {
  if (minutes <= 0) return '마감'
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''} 남음` : `${rest}분 남음`
}
