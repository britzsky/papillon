import { buildApiUrl } from '../config/api'
import { getLocalUserId } from './inventory'

/**
 * 매입 관리(ASP, 본사 전용, 2026-11-23). 서버: /v2/purchase-ledger/** (the-full-order-api PurchaseLedgerController).
 * 매입 줄 = 입고 줄 전체: 발주 입고(ORDER) · 발주서 없이 산 것(DIRECT) · 재고 시작일 전 구매 이력(HISTORY).
 * 발주 입고 금액은 발주 단가로 추정(ORDER_ESTIMATE)했다가, 구매 이력 가져오기로 공급사 청구가 오면 공급사 금액(SUPPLIER)으로 바뀐다.
 */

export type LedgerSource = 'ORDER' | 'DIRECT' | 'HISTORY'
export type CheckStatus = 'UNCHECKED' | 'MATCHED' | 'PRICE_DIFF' | 'QTY_DIFF'
export type GroupBy = 'supplier' | 'account' | 'month' | 'day'

export type LedgerFilter = {
  from_date: string
  to_date: string
  account_id?: string
  supplier_id?: string
  source?: '' | LedgerSource
  tax_type?: '' | 'TAXABLE' | 'TAX_FREE' | 'UNKNOWN'
  check_status?: '' | 'ESTIMATE' | 'DIFF' | CheckStatus
  keyword?: string
}

export type LedgerAmounts = {
  line_count: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  taxable_supply_amount: number
  taxable_vat_amount: number
  tax_free_supply_amount: number
  unknown_tax_supply_amount: number
  order_total_amount: number
  direct_total_amount: number
  history_total_amount: number
  estimate_line_count: number
  unchecked_line_count: number
  price_diff_line_count: number
  qty_diff_line_count: number
}
export type LedgerGroup = LedgerAmounts & { group_key: string; group_name: string | null }
export type LedgerSummary = { group_by: GroupBy; totals: LedgerAmounts; groups: LedgerGroup[]; price_includes_vat_suppliers: string[] }

export type LedgerLine = {
  goods_receipt_item_id: number
  receipt_date: string
  receipt_status: string
  source: LedgerSource
  account_id: string
  account_name: string | null
  supplier_id: number
  supplier_code: string
  supplier_name: string
  site_code: string | null
  site_name: string | null
  purchase_order_id: string | null
  client_ord: string | null
  client_ord_item: string | null
  supplier_item_code: string | null
  product_name: string | null
  received_qty: number
  order_unit: string
  unit_price: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  tax_type: 'TAXABLE' | 'TAX_FREE' | null
  amount_source: 'ORDER_ESTIMATE' | 'SUPPLIER'
  amount_check_status: CheckStatus | null
  amount_checked_at: string | null
  bill_supply_amount: number
  bill_qty: number
  ingredient_id: string | null
  ingredient_name: string | null
  invoice_linked: number
}
export type LedgerLines = { rows: LedgerLine[]; total_count: number; page: number; size: number }

export type PriceBasis = 'EXCLUDES_VAT' | 'INCLUDES_VAT' | 'MIXED' | 'NO_DATA'
type BasisCounts = { line_count: number; excludes_vat_count: number; includes_vat_count: number; other_count: number }
export type PriceCheckSupplier = {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  order?: BasisCounts
  history?: BasisCounts
  order_price_basis: PriceBasis
  supplier_unit_price_basis: PriceBasis
  configured_includes_vat: boolean
  setting_ok: boolean
}
export type BillRow = {
  supplier_code: string
  supplier_name: string
  bill_date: string
  account_id: string
  client_ord: string | null
  client_ord_item: string | null
  supplier_item_code?: string | null
  product_name?: string | null
  billed_qty: number
  order_unit_price?: number
  bill_unit_price?: number
  supply_amount?: number
  vat_amount?: number
  total_amount: number
  item_status?: string
}
export type PriceCheck = {
  suppliers: PriceCheckSupplier[]
  mismatch_samples: BillRow[]
  unlinked_bill_lines: BillRow[]
  billed_not_received: BillRow[]
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok || body == null) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}

const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') q.set(key, String(value)) })
  return q.toString()
}
const get = <T,>(path: string, params: Record<string, string | number | undefined>, fallback: string) =>
  fetch(buildApiUrl(`${path}?${query(params)}`)).then(response => readJson<T>(response, fallback))

const num = (value: unknown) => (value == null || value === '' ? 0 : Number(value))
const numbers = <T extends object>(row: T, keys: readonly string[]): T => {
  const copy = { ...row } as Record<string, unknown>
  keys.forEach(key => { if (key in copy) copy[key] = num(copy[key]) })
  return copy as T
}
const AMOUNT_KEYS = ['line_count', 'supply_amount', 'vat_amount', 'total_amount', 'taxable_supply_amount', 'taxable_vat_amount', 'tax_free_supply_amount',
  'unknown_tax_supply_amount', 'order_total_amount', 'direct_total_amount', 'history_total_amount', 'estimate_line_count', 'unchecked_line_count',
  'price_diff_line_count', 'qty_diff_line_count'] as const
const LINE_KEYS = ['goods_receipt_item_id', 'supplier_id', 'received_qty', 'unit_price', 'supply_amount', 'vat_amount', 'total_amount', 'bill_supply_amount', 'bill_qty', 'invoice_linked'] as const
const BILL_KEYS = ['billed_qty', 'order_unit_price', 'bill_unit_price', 'supply_amount', 'vat_amount', 'total_amount'] as const

export const getLedgerSummary = async (filter: LedgerFilter, groupBy: GroupBy): Promise<LedgerSummary> => {
  const body = await get<LedgerSummary>('/v2/purchase-ledger/summary', { ...filter, group_by: groupBy }, '매입 합계를 불러오지 못했습니다.')
  return { ...body, totals: numbers(body.totals, AMOUNT_KEYS), groups: (body.groups ?? []).map(g => numbers(g, AMOUNT_KEYS)) }
}

export const getLedgerLines = async (filter: LedgerFilter, page: number, size = 100): Promise<LedgerLines> => {
  const body = await get<LedgerLines>('/v2/purchase-ledger/lines', { ...filter, page, size }, '매입 목록을 불러오지 못했습니다.')
  return { ...body, total_count: num(body.total_count), rows: (body.rows ?? []).map(r => numbers(r, LINE_KEYS)) }
}

export const getPriceCheck = async (filter: LedgerFilter): Promise<PriceCheck> => {
  const body = await get<PriceCheck>('/v2/purchase-ledger/price-check', { from_date: filter.from_date, to_date: filter.to_date, account_id: filter.account_id },
    '단가 기준 확인을 불러오지 못했습니다.')
  const bills = (rows: BillRow[] | undefined) => (rows ?? []).map(r => numbers(r, BILL_KEYS))
  return {
    suppliers: body.suppliers ?? [],
    mismatch_samples: bills(body.mismatch_samples),
    unlinked_bill_lines: bills(body.unlinked_bill_lines),
    billed_not_received: bills(body.billed_not_received),
  }
}

export const recheckLedger = (filter: LedgerFilter) =>
  fetch(buildApiUrl('/v2/purchase-ledger/recheck'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_date: filter.from_date, to_date: filter.to_date, account_id: filter.account_id ?? '', user_id: getLocalUserId() }),
  }).then(response => readJson<{ order_item_count: number; checked: number; matched: number; price_diff: number; qty_diff: number }>(response, '다시 대조하지 못했습니다.'))
