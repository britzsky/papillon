import { buildApiUrl } from '../config/api'

/**
 * 더채움몰(2026-11-02) — 본사·현장 누구나 상품을 보고 주문한다. 주문 조회·입금 안내·배송조회·취소는 주문한 사람 본인만. 서버 /v2/dist/shop.
 * 구매 유형: ACCOUNT 거래처 구매(현장 계정, 후불 또는 무통장) / PERSONAL 개인 구매(누구나, 무통장 입금). 금액은 서버가 다시 계산한다.
 */
export type BuyerType = 'ACCOUNT' | 'PERSONAL'
export type PaymentMethod = 'BANK_TRANSFER' | 'CREDIT'
export type Row = Record<string, unknown>

export const BUYER_LABEL: Record<BuyerType, string> = { ACCOUNT: '거래처 구매', PERSONAL: '개인 구매' }
export const PAYMENT_METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: '무통장 입금', CREDIT: '후불(월말 청구)', CARD: '카드', VIRTUAL_ACCOUNT: '가상계좌', NONE: '-' }
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: '입금 대기', PAID: '주문 확정', PREPARING: '상품 준비 중', PARTIALLY_SHIPPED: '일부 출고', SHIPPED: '배송 중',
  DELIVERED: '배송 완료', COMPLETED: '구매 확정', CANCELED: '취소됨', CANCEL_REQUESTED: '취소 요청',
}
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  NONE: '-', WAITING: '입금 대기', PAID: '결제 완료', PARTIAL_REFUNDED: '일부 환불', REFUNDED: '환불 완료', CREDIT: '후불',
  READY: '청구 전', WAITING_DEPOSIT: '입금 대기', BILLED: '청구서 발행', CANCELED: '취소', EXPIRED: '입금 기한 지남', FAILED: '실패',
}
export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  READY: '출고 준비', INVOICED: '송장 등록', PICKED_UP: '집하', IN_TRANSIT: '배송 중', OUT_FOR_DELIVERY: '배달 출발', DELIVERED: '배송 완료', FAILED: '배송 실패', CANCELED: '취소',
}
export const CLAIM_STATUS_LABEL: Record<string, string> = { REQUESTED: '요청됨', APPROVED: '승인', COMPLETED: '완료', REJECTED: '거절', WITHDRAWN: '철회', COLLECTING: '회수 중', COLLECTED: '회수 완료' }
export const CANCEL_REASON_LABEL: Record<string, string> = { CHANGE_MIND: '필요 없어짐', WRONG_ORDER: '잘못 주문함', DELAY: '배송이 늦음', ETC: '기타' }
export const STORAGE_LABEL: Record<string, string> = { ROOM: '상온', CHILLED: '냉장', FROZEN: '냉동' }

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}
const get = <T,>(path: string, fallback: string) => fetch(buildApiUrl(path)).then(response => readJson<T>(response, fallback))
const post = <T,>(path: string, body: object, fallback: string) =>
  fetch(buildApiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(response => readJson<T>(response, fallback))

const BASE = '/v2/dist/shop'

export type MallContext = {
  buyer_types: BuyerType[]
  user_id: string
  account_id?: string
  account_name?: string
  account_order_enabled?: boolean
  account_defaults?: Row
  credit?: { allowed: boolean; reason: string | null; limit: number | null; outstanding: number }
  deposit: { bank_name: string; account_no: string; holder: string; due_days: number } | null
  seller_ready: boolean
  order_ready: boolean
  categories: Row[]
}
export const getMallContext = () => get<MallContext>(`${BASE}/context`, '더채움몰 정보를 불러오지 못했습니다.')

export function getMallProducts(buyerType: BuyerType, categoryId?: string, keyword?: string) {
  const params = new URLSearchParams({ buyer_type: buyerType })
  if (categoryId) params.set('category_id', categoryId)
  if (keyword) params.set('keyword', keyword)
  return get<{ products: Row[] }>(`${BASE}/products?${params}`, '상품을 불러오지 못했습니다.')
}
export const getMallProduct = (productId: number, buyerType: BuyerType) =>
  get<{ product: Row; images: Row[] }>(`${BASE}/products/${productId}?buyer_type=${buyerType}`, '상품을 불러오지 못했습니다.')

/** name은 화면 표시용(서버는 product_id·qty만 쓴다) */
export type CartLine = { product_id: number; qty: number; name?: string }
export type Quote = {
  lines: Row[]; groups: Row[]; item_amount: number; shipping_fee: number; total_amount: number
  taxable_amount: number; vat_amount: number; tax_free_amount: number
  credit?: { allowed: boolean; reason: string | null }
}
export const quoteCart = (buyer_type: BuyerType, items: CartLine[]) => post<Quote>(`${BASE}/quote`, { buyer_type, items }, '금액을 계산하지 못했습니다.')
export const placeOrder = (order: Row) => post<{ message?: string; order_id: number; order_no?: string; duplicate?: boolean }>(`${BASE}/orders`, order, '주문하지 못했습니다.')
export const getMyOrders = (status: '' | 'ACTIVE' | 'DONE') => get<{ orders: Row[] }>(`${BASE}/orders?status=${status}`, '주문 내역을 불러오지 못했습니다.')
export type MyOrder = {
  order: Row; recipient: Row; items: Row[]; payments: Row[]; shipments: Row[]; tracking_events: Row[]; history: Row[]; claims: Row[]
  cancel: { mode: 'IMMEDIATE' | 'REQUEST' | 'NONE'; reason: string | null }
}
export const getMyOrder = (orderId: number) => get<MyOrder>(`${BASE}/orders/${orderId}`, '주문을 불러오지 못했습니다.')
export const cancelMyOrder = (orderId: number, reason_code: string, reason: string) =>
  post<{ message?: string; mode?: string }>(`${BASE}/orders/${orderId}/cancel`, { reason_code, reason }, '주문을 취소하지 못했습니다.')

export const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))
export const won = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-'
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '-'
}
export const num = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : ''
}
