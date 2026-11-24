import { buildApiUrl } from '../config/api'
import { getLocalUserId } from './inventory'

/**
 * 고객사 초기 세팅(본사 전용, 2026-11-19): 공급사 구매 이력 가져오기·식재료 연결·단가 이력.
 * 서버: /v2/purchase-history/** (the-full-order-api PurchaseHistoryController). 가져온 이력은 재고에 넣지 않는다.
 */

export type ImportFailure = { supplier_code: string | null; site_code: string | null; date: string | null; message: string }
export type ImportJob = {
  job_id: string
  account_id: string
  from_date: string
  to_date: string
  inventory_start_date: string | null
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'DONE_WITH_ERRORS' | 'STOPPED' | 'FAILED'
  current: string | null
  site_count: number
  total_steps: number
  done_steps: number
  saved_line_count: number
  skipped_order_line_count: number
  /** ASP(2026-11-23): 우리 발주서 주문 줄 → 공급사 청구 줄로 저장해 발주 입고 금액과 대조 */
  bill_line_count?: number
  unlinked_bill_line_count?: number
  checked_order_item_count?: number
  amount_diff_item_count?: number
  zero_qty_line_count: number
  created_product_count: number
  auto_linked_line_count: number
  failure_count: number
  failures: ImportFailure[]
  created_at: string
  started_at: string | null
  finished_at: string | null
}
export const jobActive = (job: ImportJob | null | undefined) => job?.status === 'QUEUED' || job?.status === 'RUNNING'

export type PurchasedProduct = {
  supplier_product_id: number
  supplier_code: string
  supplier_name: string
  supplier_item_code: string
  product_name: string
  order_unit: string
  product_base_qty: number
  product_base_unit: string
  alt_base_qty: number | null
  alt_base_unit: string | null
  line_count: number
  receipt_day_count: number
  total_received_qty: number
  total_supply_amount: number
  avg_unit_price: number | null
  min_unit_price: number | null
  max_unit_price: number | null
  first_receipt_date: string
  last_receipt_date: string
  unlinked_line_count: number
  ingredient_ids: string | null
  ingredient_id: string | null
  ingredient_name: string | null
  ingredient_base_unit: string | null
  amount_share_pct: number
  cumulative_share_pct: number
  abc_class: 'A' | 'B' | 'C'
}
export type ProductList = { products: PurchasedProduct[]; product_count: number; total_supply_amount: number; abc_counts: Record<'A' | 'B' | 'C', number> }

export type IngredientPrice = {
  ingredient_id: string
  ingredient_name: string | null
  base_unit: string
  line_count: number
  product_count: number
  total_base_qty: number
  total_supply_amount: number
  weighted_unit_cost: number | null
  min_unit_cost: number | null
  max_unit_cost: number | null
  first_receipt_date: string
  last_receipt_date: string
  spread_pct: number
  price_varies: 'Y' | 'N'
}
export type PriceLine = {
  goods_receipt_item_id: number
  receipt_date: string
  receipt_status: string
  supplier_code: string
  supplier_name: string
  supplier_item_code: string
  product_name: string
  received_qty: number
  order_unit: string
  unit_price: number
  supply_amount: number
  base_received_qty: number
  base_unit: string
  unit_cost: number | null
  deviation_pct: number | null
  price_outlier: 'Y' | 'N'
}

export type Period = { from_date?: string; to_date?: string; supplier_code?: string }

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok || body == null) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}

const get = <T,>(path: string, params: Record<string, string | undefined>, fallback: string) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, value) })
  return fetch(buildApiUrl(`${path}?${query}`)).then(response => readJson<T>(response, fallback))
}
const post = <T,>(path: string, body: object, fallback: string) =>
  fetch(buildApiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, user_id: getLocalUserId() }) })
    .then(response => readJson<T>(response, fallback))

/** 숫자 칸은 서버가 문자열·숫자 어느 쪽으로 줘도 숫자로 맞춘다 */
const num = (value: unknown) => (value == null || value === '' ? null : Number(value))
const toNumbers = <T extends object>(row: T, keys: string[]): T => {
  const copy = { ...row } as Record<string, unknown>
  keys.forEach(key => { copy[key] = num(copy[key]) })
  return copy as T
}

export const getInventorySetting = (accountId: string) =>
  get<{ account_id: string; inventory_start_date: string | null }>('/v2/purchase-history/settings', { account_id: accountId }, '재고 시작일을 불러오지 못했습니다.')

export const saveInventorySetting = (accountId: string, inventoryStartDate: string) =>
  post<{ inventory_start_date: string | null; reclassified_receipt_count: number }>('/v2/purchase-history/settings',
    { account_id: accountId, inventory_start_date: inventoryStartDate }, '재고 시작일을 저장하지 못했습니다.')

export const startImport = (accountId: string, fromDate: string, toDate: string, supplierCode: string) =>
  post<ImportJob>('/v2/purchase-history/imports', { account_id: accountId, from_date: fromDate, to_date: toDate, supplier_code: supplierCode }, '구매 이력 가져오기를 시작하지 못했습니다.')

export const getImportJob = (jobId: string) =>
  fetch(buildApiUrl(`/v2/purchase-history/imports/${encodeURIComponent(jobId)}`)).then(response => readJson<ImportJob>(response, '진행 상황을 불러오지 못했습니다.'))

export const getImportJobs = (accountId: string) =>
  get<{ jobs: ImportJob[] }>('/v2/purchase-history/imports', { account_id: accountId }, '가져오기 작업을 불러오지 못했습니다.').then(body => body.jobs ?? [])

export const stopImport = (jobId: string) =>
  post<ImportJob>(`/v2/purchase-history/imports/${encodeURIComponent(jobId)}/stop`, {}, '가져오기를 멈추지 못했습니다.')

export const getPurchasedProducts = async (accountId: string, period: Period, unlinkedOnly: boolean): Promise<ProductList> => {
  const body = await get<ProductList>('/v2/purchase-history/products', { account_id: accountId, ...period, unlinked_only: unlinkedOnly ? 'Y' : undefined }, '산 상품 목록을 불러오지 못했습니다.')
  return {
    ...body,
    total_supply_amount: Number(body.total_supply_amount ?? 0),
    products: (body.products ?? []).map(row => toNumbers(row, ['supplier_product_id', 'product_base_qty', 'alt_base_qty', 'line_count', 'receipt_day_count',
      'total_received_qty', 'total_supply_amount', 'avg_unit_price', 'min_unit_price', 'max_unit_price', 'unlinked_line_count', 'amount_share_pct', 'cumulative_share_pct'])),
  }
}

/** ingredientId를 비우면 연결 해제. baseQtyPerOrderUnit: 규격으로 환산이 안 될 때 발주단위 1개당 식재료 기준수량 */
export const linkProduct = (accountId: string, supplierProductId: number, ingredientId: string, baseQtyPerOrderUnit?: string) =>
  post<{ ingredient_id: string | null; base_unit: string; base_qty_per_order_unit: number; updated_line_count: number }>('/v2/purchase-history/links',
    { account_id: accountId, supplier_product_id: supplierProductId, ingredient_id: ingredientId, base_qty_per_order_unit: baseQtyPerOrderUnit ?? '' },
    '식재료를 연결하지 못했습니다.')

export const getIngredientPrices = async (accountId: string, period: Period): Promise<{ ingredients: IngredientPrice[]; spread_alert_pct: number }> => {
  const body = await get<{ ingredients: IngredientPrice[]; spread_alert_pct: number }>('/v2/purchase-history/ingredient-prices', { account_id: accountId, ...period }, '단가 이력을 불러오지 못했습니다.')
  return { spread_alert_pct: Number(body.spread_alert_pct ?? 30), ingredients: (body.ingredients ?? []).map(row => toNumbers(row, ['line_count', 'product_count', 'total_base_qty',
    'total_supply_amount', 'weighted_unit_cost', 'min_unit_cost', 'max_unit_cost', 'spread_pct'])) }
}

export const getIngredientPriceLines = async (accountId: string, ingredientId: string, period: Period): Promise<{ weighted_unit_cost: number; lines: PriceLine[] }> => {
  const body = await get<{ weighted_unit_cost: number; lines: PriceLine[] }>('/v2/purchase-history/ingredient-prices/lines', { account_id: accountId, ingredient_id: ingredientId, ...period }, '입고 줄별 단가를 불러오지 못했습니다.')
  return { weighted_unit_cost: Number(body.weighted_unit_cost ?? 0), lines: (body.lines ?? []).map(row => toNumbers(row, ['goods_receipt_item_id', 'received_qty', 'unit_price',
    'supply_amount', 'base_received_qty', 'unit_cost', 'deviation_pct'])) }
}
