import { useSyncExternalStore } from 'react'
import type { BuyerType, CartLine } from '../../api/distShop'

/**
 * 더채움몰 장바구니: 이 브라우저·로그인 사용자별로 보관(localStorage). 가격은 담아 두지 않고 주문 화면에서 서버가 다시 계산한다.
 * 구매 유형(거래처/개인)도 함께 기억한다 — 유형마다 가격이 다르다.
 */
export type Cart = { buyer_type: BuyerType | ''; lines: CartLine[] }
const EVENT = 'mall-cart-change'
const key = () => `mall_cart:${localStorage.getItem('user_id') || 'anonymous'}`
const EMPTY: Cart = { buyer_type: '', lines: [] }
let cachedRaw: string | null = null
let cached: Cart = EMPTY

export function readCart(): Cart {
  let raw: string | null = null
  try { raw = localStorage.getItem(key()) } catch { raw = null }
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  try {
    const parsed = raw ? JSON.parse(raw) as Cart : EMPTY
    cached = { buyer_type: parsed.buyer_type || '', lines: Array.isArray(parsed.lines) ? parsed.lines.filter(line => line.product_id && line.qty > 0) : [] }
  } catch { cached = EMPTY }
  return cached
}

function writeCart(cart: Cart) {
  try { localStorage.setItem(key(), JSON.stringify(cart)) } catch { /* 저장 못 해도 화면은 계속 */ }
  window.dispatchEvent(new Event(EVENT))
}

/** 상품 담기(같은 상품이면 수량 더하기). 담을 때 고른 구매 유형으로 장바구니 유형도 바꾼다(가격은 주문 화면에서 다시 계산) */
export function addToCart(buyerType: BuyerType, productId: number, qty: number, name?: string) {
  const cart = readCart()
  const lines = [...cart.lines]
  const index = lines.findIndex(line => line.product_id === productId)
  if (index >= 0) lines[index] = { ...lines[index], qty: lines[index].qty + qty }
  else lines.push({ product_id: productId, qty, name })
  writeCart({ buyer_type: buyerType, lines })
}

export function setCartQty(productId: number, qty: number) {
  const cart = readCart()
  writeCart({ ...cart, lines: qty > 0 ? cart.lines.map(line => line.product_id === productId ? { ...line, qty } : line) : cart.lines.filter(line => line.product_id !== productId) })
}

export function setCartBuyerType(buyerType: BuyerType) {
  const cart = readCart()
  if (cart.buyer_type !== buyerType) writeCart({ ...cart, buyer_type: buyerType })
}

export const clearCart = () => writeCart(EMPTY)

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback) }
}

export const useCart = () => useSyncExternalStore(subscribe, readCart, () => EMPTY)

/** 주문 요청 번호(같은 주문을 두 번 눌러도 한 건만 접수). http 주소에서는 crypto.randomUUID가 없을 수 있다 */
export function newRequestKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`
}
