import { buildApiUrl } from '../config/api'

/** 입고 대기·결품(서버 /v2/receiving). 입고 처리 자체는 기존 /Procurement/Receive(검수완료 뒤 클릭) */
export type DeliveryType = 'CENTER' | 'DIRECT' | 'PARCEL'
export type ShortageSource = 'SUPPLIER_CONTACT' | 'SITE_CHECK' | 'SUPPLIER_SITUATION'
export const SHORTAGE_SOURCES: Array<{ value: ShortageSource; label: string }> = [
  { value: 'SITE_CHECK', label: '현장 확인(안 와서 연락함)' },
  { value: 'SUPPLIER_CONTACT', label: '공급사가 먼저 연락' },
  { value: 'SUPPLIER_SITUATION', label: '웰스토리 상황 조회로 확인' },
]
export const DELIVERY_LABELS: Record<DeliveryType, string> = { CENTER: '센터 배송', DIRECT: '직송', PARCEL: '택배' }
export const deliveryLabel = (type?: string | null) => (type && DELIVERY_LABELS[type as DeliveryType]) || '배송 구분 없음'

export type SupplierSituation = { incident_type: string; incident_qty?: number | null; confirmed_qty?: number | null; status: string; action_note?: string | null; new_delivery_date?: string | null; occurred_at?: string | null }
export type PendingState = 'WAITING' | 'CHECK_NEEDED' | 'SUPPLIER_REPORTED'
export type PendingItem = {
  purchase_order_id: string; order_status: string; client_ord: string; sold_to: string; site_name?: string | null; inspected_at?: string | null
  delivery_date: string; supplier_code: string; supplier_name: string; purchase_order_item_id: number; client_ord_item: string
  supplier_item_code: string; product_name: string; order_qty: number; received_order_qty: number; shortage_order_qty: number
  order_unit: string; unit_price_snapshot: number; item_status: string; delivery_type: DeliveryType | null; delivery_type_label: string
  delivery_type_raw?: string | null; remaining_qty: number; remaining_amount: number; expected_date: string; check_from_date: string
  supplier_situations: SupplierSituation[]; state: PendingState
}
export type RecentShortage = {
  supplier_incident_id: number; purchase_order_id: string; client_ord_item: string; client_ord: string; sold_to: string; delivery_date: string
  supplier_code: string; supplier_name: string; supplier_item_code: string; product_name: string; order_unit: string; order_qty: number
  received_order_qty: number; shortage_order_qty: number; unit_price_snapshot: number; shortage_amount: number; reason?: string | null
  source?: ShortageSource | null; contact_name?: string | null; user_id?: string | null; shortage_at: string; supplier_registered_count: number
}
export type PendingResult = { today: string; date_to: string; counts: Record<PendingState, number>; items: PendingItem[]; recent_shortages: RecentShortage[]; last_situation_sync: string | null }

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { message?: string }).message || '요청을 처리하지 못했습니다.')
  return data as T
}

export const getPending = (accountId: string, dateTo?: string) =>
  call<PendingResult>(`/v2/receiving/pending?${new URLSearchParams({ account_id: accountId, ...(dateTo ? { date_to: dateTo } : {}) })}`)

export type ShortageRequest = {
  account_id: string; purchase_order_id: string; items: Array<{ client_ord_item: string; shortage_qty?: number }>
  source: ShortageSource; reason?: string; contact_name?: string; user_id?: string
}
export type ShortageResult = { purchase_order_id: string; status: string; items: Array<{ client_ord_item: string; product_name: string; shortage_qty: number; order_unit: string; shortage_amount: number; item_status: string }> }
export const registerShortage = (body: ShortageRequest) => call<ShortageResult>('/v2/receiving/shortages', body)
export const cancelShortage = (body: { account_id: string; purchase_order_id: string; client_ord_item: string; user_id?: string }) =>
  call<{ purchase_order_id: string; client_ord_item: string; item_status: string; status: string }>('/v2/receiving/shortages/cancel', body)
export type SituationSync = { skipped: boolean; message?: string; site_count?: number; saved_count?: number; linked_count?: number; missing_count?: number; failures?: string[]; last_situation_sync?: string }
export const syncSituations = (accountId: string, force = false) => call<SituationSync>('/v2/receiving/situations/sync', { account_id: accountId, force })

/** 공급사(웰스토리 CRM·아워홈 담당자)에 보낼 결품 전달 문구 — 상황 등록 API가 없어 사람이 보낸다 */
export function shortageMessage(order: { supplier_name: string; site_name?: string | null; sold_to?: string; client_ord: string; requested_delivery_date: string },
  lines: Array<{ product_name: string; supplier_item_code?: string; order_qty: number; shortage_qty: number; order_unit: string }>, reason?: string) {
  const site = [order.site_name, order.sold_to].filter(Boolean).join(' / ')
  return [
    `[결품 확인 요청] ${order.supplier_name}`,
    `사업장: ${site}`,
    `납품일: ${order.requested_delivery_date} · 주문번호: ${order.client_ord}`,
    ...lines.map(line => `- ${line.product_name}${line.supplier_item_code ? ` (${line.supplier_item_code})` : ''}: 주문 ${line.order_qty}${line.order_unit} 중 ${line.shortage_qty}${line.order_unit} 미입고`),
    reason ? `사유: ${reason}` : '',
    '미입 등록(정산 제외) 부탁드립니다.',
  ].filter(Boolean).join('\n')
}
