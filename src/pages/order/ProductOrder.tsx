import CatalogPreparation from '../../components/CatalogPreparation'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import BatchOrderResults from '../../components/BatchOrderResults'
import { buildApiUrl } from '../../config/api'
import { getSupplierSites, getSupplierOffers, type SupplierOffer, type SupplierSite } from '../../api/supplierIntegration'
import { submitMixedProcurement, recoverMixedProcurement, startNewMixedProcurement, type BatchResult } from '../../api/mixedProcurement'
import '../operations/MenuManager.css'
import './ProductOrder.css'

type Ingredient = { ingredient_id: string; ingredient_name: string; product_name?: string }
type CartLine = { confirmed?: boolean; offer: SupplierOffer; date: string; source: string; quantity: number }
const lineKey = (line: CartLine) => `${line.offer.supplier_offer_id}:${line.date}`
/** embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다 */
export default function ProductOrder({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  return <ProductOrderContent key={accountId} accountId={accountId} initialSource={params.get('ingredient_id') || ''} embedded={embedded} />
}
function ProductOrderContent({ accountId, initialSource, embedded }: { accountId: string; initialSource: string; embedded: boolean }) {
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [source, setSource] = useState(initialSource)
  const [site, setSite] = useState('')
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') })
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [locked, setLocked] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<BatchResult | null>(null)
  const [page, setPage] = useState(1)
  useEffect(() => {
    let active = true
    if (!accountId) return
    void Promise.all([getSupplierSites(accountId), fetch(buildApiUrl(`/v2/menu-management/ingredients?${new URLSearchParams({ account_id: accountId })}`)).then(async r => {
      const data = await r.json(); if (!r.ok || !Array.isArray(data)) throw new Error('식자재 조회에 실패했습니다.'); return data as Ingredient[]
    })]).then(([nextSites, nextIngredients]) => {
      if (!active) return
      setSites(nextSites); setIngredients(nextIngredients)
      setQuery(nextIngredients.find(i => i.ingredient_id === initialSource)?.ingredient_name || '')
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
  // 서버가 검색어로 이미 걸러 관련도순으로 보냈다. 화면에서는 사업장만 거른다(동의어 결과가 빠지지 않게 문자열 포함 검사는 하지 않음).
  const filtered = offers.filter(o => !site || String(o.supplier_account_site_id) === site)
  const groups = cart.reduce<Record<string, CartLine[]>>((all, line) => { const key = line.offer.supplier_code + '|' + line.offer.external_site_code + '|' + line.date; (all[key] ||= []).push(line); return all }, {})
  const body = <>
    <section className="menu-manager-panel"><h2>공급상품 통합 발주</h2><p>웰스토리·아워홈 상품을 함께 담고, 공급사·사업장·납품일별로 발주서를 발급합니다.</p>
      <div className="menu-manager-filter-grid">
        <label>구매할 식재료<select disabled={busy || locked} value={source} onChange={e => { setSource(e.target.value); setQuery(ingredients.find(i => i.ingredient_id === e.target.value)?.ingredient_name || ''); setPage(1) }}><option value="">상품의 기존 연결 사용</option>{ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}</select></label>
        <label>공급사 · 사업장<select disabled={busy} value={site} onChange={e => { setSite(e.target.value); setPage(1) }}><option value="">전체 공급사·사업장</option>{sites.map(s => <option key={s.supplier_account_site_id} value={s.supplier_account_site_id}>{s.supplier_name} · {s.external_site_name || s.external_site_code}</option>)}</select></label>
        <label>납품일<input disabled={busy} type="date" value={date} onChange={e => { setDate(e.target.value); setOffers([]) }} /></label>
        <label>상품명·코드·공급사<input value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} /></label>
        <button disabled={busy || !date || !accountId} onClick={() => void search()}>상품 조회</button>
      </div><p>선택한 납품일의 상품을 자동 준비합니다. 준비 실패나 순기 확인이 필요한 경우 본사에 확인해주세요.</p>
      <CatalogPreparation key={accountId + date} accountId={accountId} date={date} onReady={() => void search()} />
      {message && <p role="status">{message}</p>}
      <div className="menu-manager-table-scroll"><table className="menu-manager-table"><thead><tr><th>공급사·사업장</th><th>상품</th><th>규격</th><th>가격</th><th>선택</th></tr></thead><tbody>{filtered.slice((page - 1) * 30, page * 30).map(o => <tr key={o.supplier_offer_id}><td>{o.supplier_name}<br />{o.external_site_name || o.external_site_code}</td><td>{o.product_name}<br />{o.supplier_item_code}</td><td>{o.base_qty}{o.base_unit}/{o.order_unit}</td><td>{o.purchase_price.toLocaleString()}원</td><td><button disabled={busy || locked || o.orderable_yn !== 'Y' || o.minimum_order_qty <= 0 || cart.some(l => l.offer.supplier_offer_id === o.supplier_offer_id && l.date === date)} onClick={() => { if (o.orderability_status !== 'AVAILABLE' && !window.confirm(o.product_name + ' · ' + date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까?')) return; setCart(current => [...current, { offer: o, date, source, quantity: o.minimum_order_qty, confirmed: o.orderability_status !== 'AVAILABLE' }]) }}>담기</button><small>{o.orderability_reason || o.availability_reason}</small></td></tr>)}</tbody></table></div>
      <p>{filtered.length}건 · {page}/{Math.max(1, Math.ceil(filtered.length / 30))} <button disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button><button disabled={page * 30 >= filtered.length} onClick={() => setPage(page + 1)}>다음</button></p>
      <section aria-label="혼합 발주 미리보기"><h3>선택 품목 · 발주서 {Object.keys(groups).length}건</h3>{Object.entries(groups).map(([label, lines]) => <section key={label}><h4>{lines?.[0]?.offer.supplier_name} · {lines?.[0]?.offer.external_site_name} ({lines?.[0]?.offer.external_site_code}) · {lines?.[0]?.date}</h4>{lines?.map(line => <div key={lineKey(line)}><strong>{line.offer.product_name}</strong> <label>수량 <input aria-label={`${line.offer.product_name} 발주수량`} disabled={busy || locked} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => setCart(current => current.map(l => lineKey(l) === lineKey(line) ? { ...l, quantity: Number(e.target.value) } : l))} /></label> {line.offer.order_unit} · {(line.quantity * line.offer.purchase_price).toLocaleString()}원 <button disabled={busy || locked} onClick={() => setCart(current => current.filter(l => lineKey(l) !== lineKey(line)))}>제외</button></div>)}</section>)}
        <p>상품금액 합계 {cart.reduce((sum, line) => sum + line.quantity * line.offer.purchase_price, 0).toLocaleString()}원</p>
        <button disabled={busy || locked || !cart.length || cart.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0)} onClick={() => void order()}>공급사별 발주 확정</button>{' '}
        <button disabled={busy || !accountId} onClick={() => void order(true)}>이전 요청 결과 확인</button>{' '}
        <button disabled={busy} onClick={newCart}>새 발주 작성</button>
      </section><BatchOrderResults result={result} accountId={accountId} />
    </section>
  </>
  if (embedded) return <div className="mixed-product-order">{body}</div>
  return <div className="menu-manager-page mixed-product-order"><main className="menu-manager-content"><SideMenuLayout header={<HeaderBar title="상품발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리' }, { label: '상품발주' }]} />}>{body}</SideMenuLayout></main></div>
}
