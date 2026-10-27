import { buildApiUrl } from '../config/api'

export type ShortageCriteria = {
  account_id: string
  /** PLAN=저장된 식단 필요량, STOCK=현재 부족 재고 바로 주문, INVENTORY=최근 사용량 기준 부족 예상, DRAFT=구성 중인 식단 */
  source: 'PLAN' | 'INVENTORY' | 'DRAFT' | 'STOCK' | 'FAVORITE_MENU'
  draft_meals?: Array<{ menu_id: string; planned_servings: number; meal_date?: string }>
  table_id: string
  date_from: string
  date_to: string
  delivery_date: string
  sold_to: string
  supplier_code?: string
  average_days: number
  coverage_days: number
}
export type ShortageOffer = {
  external_site_code: string
  external_site_name: string
  supplier_offer_id: number
  supplier_product_id: number
  supplier_name: string
  supplier_code: string
  supplier_item_code: string
  product_name: string
  order_unit: string
  base_unit: string
  base_qty: number
  package_base_qty: number
  purchase_price: number
  minimum_order_qty: number
  order_increment_qty: number
  recommended_qty: number
  /** MANUAL=근거 없는 '수량 직접 입력' 행(기본값 최소 발주수량, 상한 999) */
  quantity_basis?: 'MANUAL' | 'CALCULATED'
  estimated_amount: number
  orderability_status?: string
  orderability_reason?: string
  order_deadline?: string
  orderable: boolean
  availability_reason: string
  tax_type: string
  /** 나만의 식재료(하트) */
  favorite_yn?: 'Y' | 'N'
  /** 공급사 상품 사진(백엔드 offers SQL이 함께 반환, 없으면 빈 값) */
  image_url?: string | null
  thumbnail_url?: string | null
  lead_time_days?: number | null
  cutoff_code?: string | null
  cutoff_time?: string | null
}
export type ShortageRow = {
  recommended_offer_id?: number | null
  pending_incoming_qty?: number
  overdue_incoming_qty?: number
  needed_by?: string
  ingredient_id: string
  ingredient_name: string
  base_unit: string
  required_qty: number
  safe_stock_qty: number
  current_qty: number
  incoming_qty: number
  shortage_qty: number
  /** RED: 현재고+입고예정으로 필요량 자체 부족, YELLOW: 안전재고만 미달, GREEN: 부족 없음 */
  stock_status?: 'RED' | 'YELLOW' | 'GREEN'
  quantity_basis?: 'MANUAL' | 'CALCULATED'
  menu_names: string[]
  issues: string[]
  offers: ShortageOffer[]
}
/** 수량 직접 입력 행의 서버 상한(ShortageProcurementService.MANUAL_MAX_ORDER_QTY) */
export const MANUAL_MAX_ORDER_QTY = 999

export type ShortageStockFilter = '' | 'RED' | 'YELLOW' | 'CHECK'

/** 서버 stock_status가 없을 때(이전 서버) 같은 규칙으로 추정: 필요량을 못 채우면 RED, 안전재고만 모자라면 YELLOW */
export function shortageStockStatus(row: ShortageRow): 'RED' | 'YELLOW' | 'GREEN' {
  if (row.stock_status) return row.stock_status
  if (row.shortage_qty <= 0) return 'GREEN'
  return row.current_qty + row.incoming_qty < row.required_qty ? 'RED' : 'YELLOW'
}

/** 막힌 상품 사유 모음. 같은 사유는 한 번만, 여러 상품이면 상품 수를 붙인다(예: 액젓 후보 12개가 모두 단위 환산 불가). */
export function blockedReasons(reasons: (string | undefined)[], separator = ' / ') {
  const counts = new Map<string, number>()
  reasons.forEach(reason => { if (reason) counts.set(reason, (counts.get(reason) || 0) + 1) })
  return [...counts].map(([reason, count]) => count > 1 ? `${reason} (상품 ${count}개)` : reason).join(separator)
}

export function matchesStockFilter(row: ShortageRow, filter: ShortageStockFilter) {
  if (!filter) return true
  if (filter === 'CHECK') return row.issues.length > 0
  return shortageStockStatus(row) === filter
}

export const SHORTAGE_STOCK_LABELS = { RED: '필요량 부족', YELLOW: '안전재고 미달', GREEN: '충분' } as const

export type OrderSelection = { delivery_terms_confirmed?: boolean; ingredient_id: string; supplier_offer_id: number; order_qty: number }
export type ShortageResult = { criteria: ShortageCriteria; ingredients: ShortageRow[]; unconfigured_count: number; checked_at: string }
export type PreviewRow = Omit<ShortageRow, 'offers'> & {
  delivery_terms_confirmed?: boolean; offer: ShortageOffer; order_qty: number; ordered_base_qty: number; item_amount: number
  supply_amount: number | null; vat_amount: number | null; tax_type: string
}
export type OrderPreview = { criteria: ShortageCriteria; items: PreviewRow[]; item_amount: number }

async function read<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || '부족재고 발주 정보를 확인하지 못했습니다.')
  return body as T
}
export async function getShortages(criteria: ShortageCriteria, signal?: AbortSignal): Promise<ShortageResult> {
  if (criteria.source === 'DRAFT') return read(await fetch(buildApiUrl('/Procurement/Shortages'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(criteria), signal }))
  const query = new URLSearchParams(Object.entries(criteria).map(([key, value]) => [key, String(value)]))
  return read(await fetch(buildApiUrl(`/Procurement/Shortages?${query}`), { signal }))
}
export async function previewShortageOrder(criteria: ShortageCriteria, items: OrderSelection[]): Promise<OrderPreview> {
  return read(await fetch(buildApiUrl('/Procurement/Preview'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criteria, items }),
  }))
}
export async function getPlanDates(accountId: string, tableId: string): Promise<string[]> {
  const query = new URLSearchParams({ account_id: accountId, table_id: tableId })
  const rows = await read<{ meal_date: string }[]>(await fetch(buildApiUrl(`/v2/meal-plans/services?${query}`)))
  return rows.map(row => row.meal_date.slice(0, 10)).sort()
}
