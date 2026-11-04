import { buildApiUrl } from '../config/api'

/**
 * 더채움 유통 — 본사 주문 처리·거래처 결제 설정(2026-11-02, 3단계). 서버 /v2/dist/admin(본사 전용).
 * 입금 확인 → 직송 발주서(협력사 확인) / 자사재고 출고 준비 → 송장 → 배송 완료. 출고 전 취소·취소 요청 승인(환불 기록)·거절.
 */
export type Row = Record<string, unknown>
export type WorkKey = 'need_deposit' | 'need_po' | 'need_invoice' | 'cancel_requested'
export const WORK_LABEL: Record<WorkKey, string> = { need_deposit: '입금 확인 대기', need_po: '발주서 필요', need_invoice: '송장 필요', cancel_requested: '취소 요청' }
export const HQ_CANCEL_REASON_LABEL: Record<string, string> = { OUT_OF_STOCK: '품절·출하 불가', DEPOSIT_EXPIRED: '입금 기한 지남', CUSTOMER_REQUEST: '주문자 요청(전화 등)', DELAY: '배송 지연', ETC: '기타' }
export const ITEM_STATUS_LABEL: Record<string, string> = { ORDERED: '주문', PO_SENT: '발주함', PREPARING: '출고 준비', SHIPPED: '출고', DELIVERED: '배송 완료', CANCELED: '취소', RETURNED: '반품' }
export const PO_STATUS_LABEL: Record<string, string> = { DRAFT: '작성중', SENT: '전달함', CONFIRMED: '협력사 확인', PARTIAL: '일부 출고', COMPLETED: '출고 완료', CANCELED: '취소' }
export const TX_LABEL: Record<string, string> = { DEPOSIT: '입금', APPROVE: '승인', CANCEL: '취소', PARTIAL_CANCEL: '부분 취소', REFUND: '환불' }

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}
const get = <T,>(path: string, fallback: string) => fetch(buildApiUrl(path)).then(response => readJson<T>(response, fallback))
const post = (path: string, body: object, fallback: string) =>
  fetch(buildApiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(response => readJson<{ message?: string; purchase_order_id?: number; po_no?: string }>(response, fallback))

const BASE = '/v2/dist/admin'

export type OrderQuery = { status?: string; buyer_type?: string; partner_id?: string; from?: string; to?: string; keyword?: string; work?: WorkKey | '' }
export function getAdminOrders(query: OrderQuery) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
  return get<{ orders: Row[]; work: Record<WorkKey, number> }>(`${BASE}/orders?${params}`, '주문 목록을 불러오지 못했습니다.')
}
export type AdminOrder = {
  order: Row; recipient: Row; items: Row[]; payments: Row[]; transactions: Row[]; purchase_orders: Row[]; purchase_order_items: Row[]
  shipments: Row[]; claims: Row[]; history: Row[]
  actions: { confirm_deposit: boolean; po_partner_ids: number[]; prepare_own_stock: boolean; add_shipment: boolean; cancel: boolean }
}
export const getAdminOrder = (orderId: number) => get<AdminOrder>(`${BASE}/orders/${orderId}`, '주문을 불러오지 못했습니다.')
export const saveOrderNote = (orderId: number, admin_note: string) => post(`${BASE}/orders/${orderId}/note`, { admin_note }, '메모를 저장하지 못했습니다.')
export const confirmDeposit = (orderId: number, body: Row) => post(`${BASE}/orders/${orderId}/deposit`, body, '입금을 확인하지 못했습니다.')
export const createPurchaseOrder = (orderId: number, body: Row) => post(`${BASE}/orders/${orderId}/purchase-orders`, body, '발주서를 만들지 못했습니다.')
export const confirmPurchaseOrder = (purchaseOrderId: number, body: Row) => post(`${BASE}/purchase-orders/${purchaseOrderId}/confirm`, body, '협력사 확인을 저장하지 못했습니다.')
export const prepareOwnStock = (orderId: number) => post(`${BASE}/orders/${orderId}/prepare`, {}, '출고 준비로 바꾸지 못했습니다.')
export const addShipment = (orderId: number, body: Row) => post(`${BASE}/orders/${orderId}/shipments`, body, '송장을 등록하지 못했습니다.')
export const markDelivered = (shipmentId: number) => post(`${BASE}/shipments/${shipmentId}/delivered`, {}, '배송 완료로 바꾸지 못했습니다.')
export const cancelOrderByHq = (orderId: number, body: Row) => post(`${BASE}/orders/${orderId}/cancel`, body, '주문을 취소하지 못했습니다.')
export const approveCancelClaim = (claimId: number, body: Row) => post(`${BASE}/claims/${claimId}/approve`, body, '취소 요청을 승인하지 못했습니다.')
export const rejectCancelClaim = (claimId: number, reason: string) => post(`${BASE}/claims/${claimId}/reject`, { reason }, '취소 요청을 거절하지 못했습니다.')

export const getAccountProfiles = (keyword: string, onlySet: boolean) =>
  get<{ accounts: Row[] }>(`${BASE}/account-profiles?keyword=${encodeURIComponent(keyword)}&only_set=${onlySet}`, '거래처 결제 설정을 불러오지 못했습니다.')
export const getAccountProfile = (accountId: string) => get<{ profile: Row }>(`${BASE}/account-profiles/${encodeURIComponent(accountId)}`, '거래처 결제 설정을 불러오지 못했습니다.')
export const saveAccountProfile = (profile: Row) => post(`${BASE}/account-profiles`, profile, '거래처 결제 설정을 저장하지 못했습니다.')
