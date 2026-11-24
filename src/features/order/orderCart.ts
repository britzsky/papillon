import type { OrderSelection } from '../../api/shortageProcurement'

/**
 * 발주 장바구니(2026-11-23 사용자 결정: '고른 품목 임시 저장'). 서버에 보내지 않고 이 기기에만 둔다.
 * 거래처 + 발주 기준(식단표·현재 부족·사용량·나만의 메뉴)별로 하나. 발주를 마치면 비운다.
 * 불러올 때는 지금 목록에 있는 식재료·발주 가능한 상품만 다시 담는다(가격·마감은 발주서 확인 때 서버가 다시 검증).
 */
export type OrderCart = { saved_at: string; delivery_date: string; items: OrderSelection[] }

const cartKey = (accountId: string, source: string) => `order-cart:${accountId || '-'}:${source}`

export function loadOrderCart(accountId: string, source: string): OrderCart | null {
  try {
    const value = JSON.parse(localStorage.getItem(cartKey(accountId, source)) || 'null') as OrderCart | null
    return value && Array.isArray(value.items) && value.items.length ? value : null
  } catch { return null }
}

export function saveOrderCart(accountId: string, source: string, deliveryDate: string, selected: Record<string, OrderSelection>): OrderCart | null {
  const items = Object.values(selected)
  const cart = { saved_at: new Date().toISOString(), delivery_date: deliveryDate, items }
  try {
    if (!items.length) { localStorage.removeItem(cartKey(accountId, source)); return null }
    localStorage.setItem(cartKey(accountId, source), JSON.stringify(cart))
    return cart
  } catch { return null }
}

export function clearOrderCart(accountId: string, source: string) {
  try { localStorage.removeItem(cartKey(accountId, source)) } catch { /* 저장소를 못 쓰는 기기 */ }
}
