import type { ShortageCriteria } from './shortageProcurement'
import { buildApiUrl } from '../config/api'

type Row = Record<string, unknown>

export type SupplierSite = {
  supplier_account_site_id: number
  supplier_id: number
  supplier_code: string
  supplier_name: string
  external_site_code: string
  external_site_name: string
  representative_site_code: string
  center_code: string
  last_synced_at: string
}

export type SupplierOffer = {
  external_site_code: string
  external_site_name: string
  supplier_offer_id: number
  supplier_product_id: number
  supplier_account_site_id: number
  account_ingredient_product_id: number
  supplier_id: number
  supplier_code: string
  supplier_name: string
  ingredient_id: string
  /** 이 거래처에서 상품이 실제로 연결된 식재료. 미연결이면 빈 값 (본사 식자재 분류와 무관) */
  linked_ingredient_id: string
  linked_ingredient_name: string
  supplier_item_code: string
  product_name: string
  order_unit: string
  /** 이 거래처 기준 발주단위 1개 수량 (연결 시 고른 규격, 없으면 상품 대표 규격) */
  base_qty: number
  base_unit: string
  /** 상품 규격 후보: 대표(무게·부피 우선)와 두 번째(개수 등). 예: 계란 1PAC = 1560g / 30EA */
  pack_options: { base_qty: number; base_unit: string }[]
  purchase_price: number
  minimum_order_qty: number
  order_increment_qty: number
  product_status: string
  orderability_status?: string
  orderability_reason?: string
  order_deadline?: string
  orderable_yn: string
  availability_reason: string
  last_synced_at: string
  stale: boolean
  suggested_order_qty: number
}

export type SupplierSyncStatus = {
  supplier_sync_checkpoint_id: number
  supplier_name: string
  external_site_name: string
  sync_type: string
  last_succeeded_at: string
  last_failed_at: string
  last_result_code: string
  last_result_message: string
  consecutive_failures: number
}

const text = (value: unknown) => value == null ? '' : String(value)
const number = (value: unknown) => Number(value) || 0

async function getRows(path: string) {
  const response = await fetch(buildApiUrl(path))
  const payload = await response.json() as unknown
  if (!response.ok) {
    const message = payload && typeof payload === 'object' ? text((payload as Row).message) : ''
    throw new Error(message || '공급사 연동 정보를 불러오지 못했습니다.')
  }
  return Array.isArray(payload) ? payload as Row[] : []
}

async function postCommand(path: string, body: Row) {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const payload = await response.json() as Row
  if (!response.ok) throw new Error(text(payload.message) || '공급사 동기화에 실패했습니다.')
  return payload
}

export function syncWelstorySites(accountId: string) {
  return postCommand('/v2/supplier-integration/sync/welstory/sites', {
    account_id: accountId, user_id: localStorage.getItem('user_id') || '',
  })
}

export function syncWelstoryCatalog(accountId: string, soldTo: string, year: string, period: string) {
  return postCommand('/v2/supplier-integration/sync/welstory/catalog', {
    account_id: accountId, sold_to: soldTo, period_group_year: year, period_group: period,
    user_id: localStorage.getItem('user_id') || '',
  })
}

/** 순기 번호 입력 없이: 오늘 순기·차순기를 웰스토리 응답 날짜로 찾아, 안 받은 순기는 전체 판가·받은 순기는 변경 판가를 받는다. */
export type WelstoryCycleResult = { cycle?: string; from?: string; to?: string; status?: string; result?: Row }
export type WelstoryAutoSiteResult = { sold_to: string; error?: string; current?: WelstoryCycleResult; next?: WelstoryCycleResult }
export async function syncWelstoryAuto(accountId: string): Promise<WelstoryAutoSiteResult[]> {
  const payload = await postCommand('/v2/supplier-integration/sync/welstory/auto', {
    account_id: accountId, user_id: localStorage.getItem('user_id') || '',
  })
  return Array.isArray(payload.sites) ? payload.sites as WelstoryAutoSiteResult[] : []
}

export function syncWelstoryReceipts(accountId: string, soldTo: string, receiptDate: string) {
  return postCommand('/v2/supplier-integration/sync/welstory/receipts', {
    account_id: accountId,
    sold_to: soldTo,
    receipt_date: receiptDate.replaceAll('-', ''),
    user_id: localStorage.getItem('user_id') || '',
  })
}

export async function getSupplierSites(accountId: string): Promise<SupplierSite[]> {
  const rows = await getRows(`/v2/supplier-integration/sites?account_id=${encodeURIComponent(accountId)}&active_yn=Y`)
  return rows.map((row) => ({
    supplier_account_site_id: number(row.supplier_account_site_id), supplier_id: number(row.supplier_id),
    supplier_code: text(row.supplier_code), supplier_name: text(row.supplier_name),
    external_site_code: text(row.external_site_code), external_site_name: text(row.external_site_name),
    representative_site_code: text(row.representative_site_code), center_code: text(row.center_code),
    last_synced_at: text(row.last_synced_at),
  }))
}

/** 서버 검색 옵션: keyword(동의어 포함, 관련도순)·offerIds(지정 상품만)·limit. 사업장 전체 상품(1만여 건, 수십 MB)을 받지 않기 위해 화면에서는 가능한 한 지정한다. */
export type OfferSearch = { keyword?: string; offerIds?: number[]; limit?: number }
export async function getSupplierOffers(accountId: string, deliveryDate: string, requiredBaseQty?: number, externalSiteCode?: string, search?: OfferSearch): Promise<SupplierOffer[]> {
  const query = new URLSearchParams({ account_id: accountId, delivery_date: deliveryDate, orderable_only: 'N' })
  if (requiredBaseQty != null) query.set('required_base_qty', String(requiredBaseQty))
  if (externalSiteCode) query.set('external_site_code', externalSiteCode)
  if (search?.keyword?.trim()) query.set('keyword', search.keyword.trim())
  if (search?.offerIds) { if (!search.offerIds.length) return []; query.set('offer_ids', search.offerIds.join(',')) }
  if (search?.limit) query.set('limit', String(search.limit))
  const rows = await getRows(`/v2/supplier-integration/offers?${query}`)
  return rows.map((row) => ({
    supplier_offer_id: number(row.supplier_offer_id), supplier_account_site_id: number(row.supplier_account_site_id),
    supplier_product_id: number(row.supplier_product_id),
    external_site_code: text(row.external_site_code), external_site_name: text(row.external_site_name),
    account_ingredient_product_id: number(row.account_ingredient_product_id), supplier_id: number(row.supplier_id),
    supplier_code: text(row.supplier_code), supplier_name: text(row.supplier_name), ingredient_id: text(row.ingredient_id),
    linked_ingredient_id: text(row.linked_ingredient_id), linked_ingredient_name: text(row.linked_ingredient_name),
    supplier_item_code: text(row.supplier_item_code), product_name: text(row.product_name), order_unit: text(row.order_unit),
    base_qty: number(row.base_qty), base_unit: text(row.base_unit), purchase_price: number(row.purchase_price),
    pack_options: [
      { base_qty: number(row.product_base_qty ?? row.base_qty), base_unit: text(row.product_base_unit ?? row.base_unit) },
      ...(row.alt_base_qty != null ? [{ base_qty: number(row.alt_base_qty), base_unit: text(row.alt_base_unit) }] : []),
    ],
    minimum_order_qty: number(row.minimum_order_qty), order_increment_qty: number(row.order_increment_qty),
    orderability_status: text(row.orderability_status), orderability_reason: text(row.orderability_reason), order_deadline: text(row.order_deadline),
    product_status: text(row.product_status), orderable_yn: text(row.orderable_yn),
    availability_reason: text(row.availability_reason), last_synced_at: text(row.last_synced_at), stale: Boolean(row.stale),
    suggested_order_qty: number(row.suggested_order_qty),
  }))
}

export type IntegratedOrderItem = {
  source_ingredient_id?: string
  ingredient_id: string
  menu_id: string
  welstory_item_code: string
  order_qty: number
  order_unit: string
  base_unit: string
  base_qty_per_order_unit: number
  expected_price?: number
}

export async function submitWelstoryProcurementOrder(input: {
  accountId: string
  soldTo: string
  deliveryDate: string
  items: IntegratedOrderItem[]
  shortageCriteria?: ShortageCriteria
}) {
  // 응답이 유실되어도 같은 장바구니는 같은 요청키로 결과를 조회한다.
  const signature = JSON.stringify(input)
  const storageKey = 'pending-supplier-order:' + input.accountId
  let pending: { signature: string; key: string } | null = null
  try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { pending = null }
  if (pending?.signature !== signature) pending = { signature, key: crypto.randomUUID() }
  sessionStorage.setItem(storageKey, JSON.stringify(pending))
  const response = await fetch(buildApiUrl('/Procurement/Order'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        account_id: input.accountId,
        sold_to: input.soldTo,
        request_key: pending.key,
        req_delivery_date: input.deliveryDate,
        client_note: '통합 식자재 발주 화면',
        shortage_criteria: input.shortageCriteria,
        user_id: localStorage.getItem('user_id') || '',
      },
      items: input.items,
    }),
  })
  const payload = await response.json() as Row
  if (!response.ok) throw new Error(text(payload.message) || '웰스토리 발주에 실패했습니다.')
  return payload
}

export async function getSupplierSyncStatus(accountId: string): Promise<SupplierSyncStatus[]> {
  return (await getRows(`/v2/supplier-integration/sync-status?account_id=${encodeURIComponent(accountId)}`)).map((row) => ({
    supplier_sync_checkpoint_id: number(row.supplier_sync_checkpoint_id), supplier_name: text(row.supplier_name),
    external_site_name: text(row.external_site_name), sync_type: text(row.sync_type),
    last_succeeded_at: text(row.last_succeeded_at), last_failed_at: text(row.last_failed_at),
    last_result_code: text(row.last_result_code), last_result_message: text(row.last_result_message),
    consecutive_failures: number(row.consecutive_failures),
  }))
}
