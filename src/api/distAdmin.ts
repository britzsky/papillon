import { buildApiUrl } from '../config/api'

/**
 * 더채움 유통 — 본사 '협력사 관리'(2026-11-02). 판매 주체·협력사·카테고리·상품·가격·판매 가능·이미지. 서버 /v2/dist/admin(본사 전용).
 * 가격은 기간 이력: 새 판매가를 넣으면 같은 유형의 이전 가격이 그 시각에 끝난다. 상품은 '작성중'으로 등록 → 판매가 확인 후 '판매중'.
 */
export type SaleStatus = 'DRAFT' | 'ON_SALE' | 'SOLD_OUT' | 'PAUSED' | 'DISCONTINUED'
export type Fulfillment = 'DROP_SHIP' | 'OWN_STOCK'
export type PriceType = 'ACCOUNT' | 'PERSONAL' | 'EVENT' | 'INTERNAL'
export type Row = Record<string, unknown>

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = { DRAFT: '작성중', ON_SALE: '판매중', SOLD_OUT: '품절', PAUSED: '일시중지', DISCONTINUED: '단종' }
export const FULFILLMENT_LABEL: Record<Fulfillment, string> = { DROP_SHIP: '협력사 직송', OWN_STOCK: '자사재고' }
export const PRICE_TYPE_LABEL: Record<PriceType, string> = { ACCOUNT: '거래처가', PERSONAL: '개인가', EVENT: '행사가', INTERNAL: '사내 대체가' }
export const SALE_TARGET_LABEL: Record<string, string> = { ALL: '전체', ACCOUNT: '거래처만', PERSONAL: '개인만', INTERNAL: '사내 소진 전용' }
export const TAX_LABEL: Record<string, string> = { TAXABLE: '과세', TAX_FREE: '면세' }
export const STORAGE_LABEL: Record<string, string> = { ROOM: '상온', CHILLED: '냉장', FROZEN: '냉동' }
export const PARTNER_TYPE_LABEL: Record<string, string> = { SUPPLIER: '매입처(자사재고)', DROP_SHIPPER: '직송 공급', BOTH: '둘 다' }
export const PO_METHOD_LABEL: Record<string, string> = { MANUAL: '직접 연락', EMAIL: '이메일', KAKAO: '카카오톡', API: 'API', PORTAL: '협력사 화면' }
export const AVAILABILITY_LABEL: Record<string, string> = { AVAILABLE: '판매 가능', LIMITED: '수량 제한', UNAVAILABLE: '판매 불가' }
export const HISTORY_LABEL: Record<string, string> = { CREATE: '등록', UPDATE: '수정', PRICE: '가격', STOP: '판매 중지' }

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}

const get = <T,>(path: string, fallback: string) => fetch(buildApiUrl(path)).then(response => readJson<T>(response, fallback))
const send = <T = { message?: string },>(method: string, path: string, body: object, fallback: string) =>
  fetch(buildApiUrl(path), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(response => readJson<T>(response, fallback))

const BASE = '/v2/dist/admin'

export const getSeller = () => get<{ seller: Row | null }>(`${BASE}/seller`, '판매 주체 정보를 불러오지 못했습니다.')
export const saveSeller = (seller: Row) => send('PUT', `${BASE}/seller`, seller, '판매 주체 정보를 저장하지 못했습니다.')

export const getPartners = () => get<{ partners: Row[]; carriers: Row[] }>(`${BASE}/partners`, '협력사 목록을 불러오지 못했습니다.')
export const savePartner = (partner: Row) => send<{ message?: string; partner_id?: number }>('POST', `${BASE}/partners`, partner, '협력사를 저장하지 못했습니다.')

export const getCategories = () => get<{ categories: Row[] }>(`${BASE}/categories`, '카테고리를 불러오지 못했습니다.')
export const saveCategory = (category: Row) => send('POST', `${BASE}/categories`, category, '카테고리를 저장하지 못했습니다.')

export type ProductQuery = { partner_id?: string; category_id?: string; sale_status?: string; fulfillment_type?: string; keyword?: string }
export function getProducts(query: ProductQuery) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
  return get<{ products: Row[] }>(`${BASE}/products?${params}`, '상품 목록을 불러오지 못했습니다.')
}
export type ProductDetail = { product: Row; images: Row[]; sale_prices: Row[]; cost_prices: Row[]; availability: Row[]; history: Row[] }
export const getProduct = (productId: number) => get<ProductDetail>(`${BASE}/products/${productId}`, '상품을 불러오지 못했습니다.')
export const saveProduct = (product: Row) => send<{ message?: string; product_id?: number }>('POST', `${BASE}/products`, product, '상품을 저장하지 못했습니다.')
export const changeSaleStatus = (product_id: number, sale_status: SaleStatus, reason?: string) =>
  send('POST', `${BASE}/products/status`, { product_id, sale_status, reason }, '판매 상태를 바꾸지 못했습니다.')
export const addSalePrice = (price: Row) => send('POST', `${BASE}/products/sale-prices`, price, '판매가를 저장하지 못했습니다.')
export const endSalePrice = (product_id: number, sale_price_id: number) =>
  send('POST', `${BASE}/products/sale-prices/end`, { product_id, sale_price_id }, '판매가를 종료하지 못했습니다.')
export const addCostPrice = (price: Row) => send('POST', `${BASE}/products/cost-prices`, price, '매입가를 저장하지 못했습니다.')
export const saveAvailability = (row: Row) => send('POST', `${BASE}/products/availability`, row, '판매 가능 정보를 저장하지 못했습니다.')
export const addProductImage = (product_id: number, image_url: string, image_type: string) =>
  send('POST', `${BASE}/products/images`, { product_id, image_url, image_type }, '이미지를 추가하지 못했습니다.')
export const deleteProductImage = (product_id: number, product_image_id: number) =>
  fetch(buildApiUrl(`${BASE}/products/images?product_id=${product_id}&product_image_id=${product_image_id}`), { method: 'DELETE' })
    .then(response => readJson<{ message?: string }>(response, '이미지를 빼지 못했습니다.'))

/** 화면 표시용 */
export const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))
export const won = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-'
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '-'
}
export const qty = (value: unknown) => {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : ''
}
