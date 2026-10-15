import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import { getSupplierSites, getSupplierOffers, type SupplierOffer, type SupplierSite } from '../../api/supplierIntegration'
import { submitMixedProcurement, recoverMixedProcurement, startNewMixedProcurement, type BatchResult } from '../../api/mixedProcurement'

export type ProductIngredient = { ingredient_id: string; ingredient_name: string; product_name?: string }
export type CartLine = { confirmed?: boolean; offer: SupplierOffer; date: string; source: string; quantity: number }
export const lineKey = (line: CartLine) => `${line.offer.supplier_offer_id}:${line.date}`

/**
 * 상품 검색 발주(PC 발주하기 '상품 검색' 탭·터치 화면 공용): 웰스토리·아워홈 상품을 검색(동의어 포함, 관련도순 300건)해
 * 장바구니에 담고 공급사·사업장·납품일별로 한 번에 발주한다. 담을 때 구매할 식재료(source)를 정하면 그 식재료로 연결된다.
 */
export function useProductOrder(accountId: string, initialSource: string) {
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [ingredients, setIngredients] = useState<ProductIngredient[]>([])
  const [source, setSource] = useState(initialSource)
  const [site, setSite] = useState('')
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') })
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  // 발주하기 머리 줄 검색창에서 넘어오면 ?q= 로 받는다
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [cart, setCart] = useState<CartLine[]>([])
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [locked, setLocked] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<BatchResult | null>(null)
  const [page, setPage] = useState(1)
  // 발주하기 머리 줄 검색창에서 ?q= 로 들어오면 첫 화면에서 바로 한 번 조회한다
  const initialQuery = useRef(new URLSearchParams(window.location.search).get('q') || '')
  const [autoSearch, setAutoSearch] = useState(false)
  useEffect(() => {
    let active = true
    if (!accountId) return
    void Promise.all([getSupplierSites(accountId), fetch(buildApiUrl(`/v2/menu-management/ingredients?${new URLSearchParams({ account_id: accountId })}`)).then(async r => {
      const data = await r.json(); if (!r.ok || !Array.isArray(data)) throw new Error('식자재 조회에 실패했습니다.'); return data as ProductIngredient[]
    })]).then(([nextSites, nextIngredients]) => {
      if (!active) return
      setSites(nextSites); setIngredients(nextIngredients)
      // 식재료를 지정해 들어온 경우만 검색어를 식재료명으로(머리 줄 검색어 ?q= 는 유지)
      if (initialSource) setQuery(nextIngredients.find(i => i.ingredient_id === initialSource)?.ingredient_name || '')
      else if (initialQuery.current) setAutoSearch(true)
    }).catch(e => { if (active) setMessage(e.message) })
    return () => { active = false }
  }, [accountId, initialSource])
  const search = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage(''); setOffers([]); setPage(1)
    // 서버에서 검색어(동의어 포함)로 찾아 관련도순 최대 300건만 받는다
    try { setOffers((await getSupplierOffers(accountId, date, undefined, undefined, { keyword: query, limit: 300 })).filter(o => ['WELSTORY', 'OURHOME'].includes(o.supplier_code))) }
    catch (e) { setMessage(e instanceof Error ? e.message : '상품 조회 실패') }
    finally { pending.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!autoSearch) return
    setAutoSearch(false)
    void search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch])
  const order = async (recover = false) => {
    if (pending.current || (!recover && !cart.length)) return
    pending.current = true; setBusy(true); setLocked(true); setMessage('')
    try {
      setResult(await (recover ? recoverMixedProcurement(accountId) : submitMixedProcurement({ account_id: accountId,
        items: cart.map(line => ({ delivery_terms_confirmed: line.confirmed, supplier_offer_id: line.offer.supplier_offer_id, delivery_date: line.date, order_qty: line.quantity, expected_price: line.offer.purchase_price, source_ingredient_id: line.source || line.offer.linked_ingredient_id })) })))
    } catch (e) { setMessage(e instanceof Error ? e.message : '발주 결과 확인 실패') }
    finally { pending.current = false; setBusy(false) }
  }
  const newCart = () => {
    try { startNewMixedProcurement(accountId); setCart([]); setResult(null); setLocked(false); setMessage('') }
    catch (e) { setMessage(e instanceof Error ? e.message : '기존 발주를 확인하세요.') }
  }
  const chooseSource = (value: string) => { setSource(value); setQuery(ingredients.find(i => i.ingredient_id === value)?.ingredient_name || ''); setPage(1) }
  const changeDate = (value: string) => { setDate(value); setOffers([]) }
  const inCart = (offer: SupplierOffer) => cart.some(l => l.offer.supplier_offer_id === offer.supplier_offer_id && l.date === date)
  const canAdd = (offer: SupplierOffer) => !busy && !locked && offer.orderable_yn === 'Y' && offer.minimum_order_qty > 0 && !inCart(offer)
  /** 담기: 납품·마감이 확인되지 않은 상품은 사용자가 공급사에 직접 확인했는지 묻는다 */
  const addToCart = (offer: SupplierOffer) => {
    if (offer.orderability_status !== 'AVAILABLE' && !window.confirm(offer.product_name + ' · ' + date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까?')) return
    setCart(current => [...current, { offer, date, source, quantity: offer.minimum_order_qty, confirmed: offer.orderability_status !== 'AVAILABLE' }])
  }
  const setLineQuantity = (line: CartLine, quantity: number) => setCart(current => current.map(l => lineKey(l) === lineKey(line) ? { ...l, quantity } : l))
  const removeLine = (line: CartLine) => setCart(current => current.filter(l => lineKey(l) !== lineKey(line)))

  // 서버가 검색어로 이미 걸러 관련도순으로 보냈다. 화면에서는 사업장만 거른다(동의어 결과가 빠지지 않게 문자열 포함 검사는 하지 않음).
  const filtered = offers.filter(o => !site || String(o.supplier_account_site_id) === site)
  const groups = cart.reduce<Record<string, CartLine[]>>((all, line) => { const key = line.offer.supplier_code + '|' + line.offer.external_site_code + '|' + line.date; (all[key] ||= []).push(line); return all }, {})
  const cartTotal = cart.reduce((sum, line) => sum + line.quantity * line.offer.purchase_price, 0)
  const canOrder = !busy && !locked && cart.length > 0 && !cart.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0)

  return {
    sites, ingredients, source, chooseSource, site, setSite, date, changeDate, offers, query, setQuery, cart, busy, locked, message, result, page, setPage,
    search, order, newCart, canAdd, addToCart, setLineQuantity, removeLine, filtered, groups, cartTotal, canOrder,
  }
}
