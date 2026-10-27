import { useState } from 'react'
import { setFavoriteProduct } from '../api/supplierIntegration'
import './FavoriteProductHeart.css'

/**
 * 나만의 식재료 하트(웰스토리·아워홈 공급사 상품 한 건 단위). 부족량 발주·발주 확인·입고 화면 공용.
 * 지정한 상품은 상품 검색 발주의 '나만의 식재료'에서 바로 발주할 수 있다.
 */
export default function FavoriteProductHeart({ accountId, supplierProductId, productName, favorite }: { accountId: string; supplierProductId?: number; productName: string; favorite?: boolean }) {
  const [on, setOn] = useState(Boolean(favorite))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!accountId || !supplierProductId) return null
  const toggle = async () => {
    setBusy(true); setError('')
    try { await setFavoriteProduct(accountId, supplierProductId, !on); setOn(!on) }
    catch (e) { setError(e instanceof Error ? e.message : '나만의 식재료를 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <button type="button" className={`favorite-product-heart${on ? ' is-on' : ''}${error ? ' is-error' : ''}`} aria-pressed={on} disabled={busy}
    aria-label={`${productName} 나만의 식재료${on ? ' 해제' : ' 지정'}`} title={error || (on ? '나만의 식재료 해제' : '나만의 식재료로 저장')}
    onClick={e => { e.stopPropagation(); void toggle() }}>{on ? '♥' : '♡'}</button>
}
