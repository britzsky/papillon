import PlanningCostEditor from './PlanningCostEditor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { getSupplierOffers, getSupplierSites, type SupplierOffer, type SupplierSite } from '../api/supplierIntegration'
import { getIngredientProductLinks, getLinkSuggestions, linkIngredientProduct, unlinkIngredientProduct, type IngredientProductLink, type LinkSuggestion } from '../api/ingredientProductMapping'
import { getLocalUserId, type IngredientMasterItem } from '../api/inventory'
import { pickPack } from '../utils/quantityUnits'
import { productSearchScore } from '../utils/productMatch'
import './IngredientProductLinkModal.css'

const SEARCH_LIMIT = 200

/**
 * onAdvance가 있으면 새 연결을 마친 뒤 창에 머물지 않고 호출한다(다음 미연결 식재료로 이동하거나 닫기).
 * 교체·해제·편성 단가 관리는 같은 식재료를 계속 다루므로 창을 유지한다. notice는 이전 식재료 연결 결과 안내.
 */
export default function IngredientProductLinkModal({ ingredient, accountId, onClose, onLinked, onAdvance, nextIngredientName, notice }: { ingredient: Pick<IngredientMasterItem, 'ingredient_id' | 'ingredient_name' | 'base_unit'>; accountId: string; onClose: () => void; onLinked: () => void; onAdvance?: (message: string) => void; nextIngredientName?: string; notice?: string }) {
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [siteId, setSiteId] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [keyword, setKeyword] = useState(ingredient.ingredient_name)
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [costProduct, setCostProduct] = useState<number | null>(null)
  const [selected, setSelected] = useState<SupplierOffer | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(1)
  const [links, setLinks] = useState<IngredientProductLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [linksError, setLinksError] = useState('')
  const [replacing, setReplacing] = useState<IngredientProductLink | null>(null)
  const [removing, setRemoving] = useState<IngredientProductLink | null>(null)
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([])
  const [suggestionOffers, setSuggestionOffers] = useState<SupplierOffer[]>([])
  // 검색어는 입력이 멈춘 뒤(300ms) 서버에서 검색한다(전체 상품을 받지 않음)
  const [searchKeyword, setSearchKeyword] = useState(ingredient.ingredient_name)
  useEffect(() => { const timer = window.setTimeout(() => setSearchKeyword(keyword), 300); return () => window.clearTimeout(timer) }, [keyword])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const siteKey = `ingredient-link:site:${accountId}`
  const dialogRef = useRef<HTMLElement>(null)
  const busy = useRef(false)
  const site = sites.find(item => String(item.supplier_account_site_id) === siteId)
  useEffect(() => {
    let active = true
    setLinksLoading(true); setLinksError('')
    void getIngredientProductLinks(accountId, ingredient.ingredient_id).then(data => { if (active) setLinks(data) })
      .catch(e => active && setLinksError(e.message)).finally(() => active && setLinksLoading(false))
    return () => { active = false }
  }, [accountId, ingredient.ingredient_id, revision])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    let active = true
    if (!accountId) { setError('로그인한 거래처 정보를 확인해주세요.'); return }
    setLoading(true)
    void getSupplierSites(accountId).then(data => {
      if (!active) return
      setSites(data)
      // 마지막에 고른 사업장을 기억한다(없거나 더 이상 지정되지 않은 사업장이면 전체)
      let remembered = ''
      try { remembered = localStorage.getItem(siteKey) || '' } catch { remembered = '' }
      if (data.length === 1) setSiteId(String(data[0].supplier_account_site_id))
      else if (data.some(item => String(item.supplier_account_site_id) === remembered)) setSiteId(remembered)
    }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [accountId, siteKey])
  useEffect(() => {
    let active = true
    setOffers([]); setSelected(null); setConfirmed(false); setError('')
    if (!accountId || !date) { setLoading(false); return }
    setLoading(true)
    void getSupplierOffers(accountId, date, undefined, site?.external_site_code, { keyword: searchKeyword, limit: SEARCH_LIMIT }).then(data => {
      if (active) setOffers(data.filter(row => !site || row.supplier_account_site_id === site.supplier_account_site_id))
    }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [accountId, site, date, revision, searchKeyword])
  useEffect(() => {
    let active = true
    if (!accountId || !date) return
    setSuggestionsLoading(true)
    void getLinkSuggestions(accountId, ingredient.ingredient_id, date).then(async data => {
      // 한 번 클릭 연결에 필요한 상품 정보(규격·발주단위)는 추천 상품만 따로 받는다
      const offerRows = await getSupplierOffers(accountId, date, undefined, undefined, { offerIds: data.map(item => item.supplier_offer_id) })
      if (active) { setSuggestions(data); setSuggestionOffers(offerRows) }
    }).catch(() => { if (active) { setSuggestions([]); setSuggestionOffers([]) } }).finally(() => { if (active) setSuggestionsLoading(false) })
    return () => { active = false }
  }, [accountId, ingredient.ingredient_id, date, revision])
  // 검색: 띄어쓰기·괄호 무시, 동의어(돼지고기↔돈육 등) 포함, 관련도순 정렬
  const filtered = useMemo(() => offers
    .map(offer => ({ offer, score: productSearchScore(keyword, offer) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(row => row.offer), [offers, keyword])
  const suggestedOffers = suggestions
    .map(suggestion => ({ suggestion, offer: suggestionOffers.find(offer => offer.supplier_offer_id === suggestion.supplier_offer_id) }))
  useEffect(() => { setPage(1); setSelected(null); setConfirmed(false) }, [keyword, siteId, date])
  const pages = Math.max(1, Math.ceil(filtered.length / 20))
  // 상품 규격 후보(예: 1560g / 30EA) 중 이 식재료 기준단위에 맞는 것으로 환산한다
  const converted = selected ? pickPack(selected.pack_options, ingredient.base_unit)?.converted ?? 0 : 0
  // 연결 상태는 이 거래처의 실제 연결만 본다. 본사 식자재 마스터 분류는 거래처 연결에 영향을 주지 않는다.
  const linkStatus = (offer: SupplierOffer) => !offer.linked_ingredient_id ? '미연결'
    : offer.linked_ingredient_id === ingredient.ingredient_id ? '이 식재료에 연결됨'
      : <>이 거래처의 다른 식재료에 연결됨<small>{offer.linked_ingredient_name || offer.linked_ingredient_id}</small></>
  const movingFrom = selected?.linked_ingredient_id && selected.linked_ingredient_id !== ingredient.ingredient_id
    ? selected.linked_ingredient_name || selected.linked_ingredient_id : ''
  const save = async () => {
    if (!selected || !confirmed || converted <= 0) return
    await link(selected)
  }
  /** 추천 상품은 한 번 클릭으로 연결. 다른 식재료에 연결된 상품을 옮길 때만 확인을 받는다. */
  const linkSuggested = async (offer: SupplierOffer, suggestion: LinkSuggestion) => {
    if (suggestion.warning && !window.confirm(`${offer.product_name}
${suggestion.warning}
계속할까요?`)) return
    await link(offer)
  }
  const link = async (offer: SupplierOffer) => {
    if (busy.current || (pickPack(offer.pack_options, ingredient.base_unit)?.converted ?? 0) <= 0) return
    busy.current = true; setSaving(true); setError(''); setMessage('')
    try {
      await linkIngredientProduct({ accountId, ingredientId: ingredient.ingredient_id, baseUnit: ingredient.base_unit, offer, userId: getLocalUserId(), replaceLinkId: replacing?.account_ingredient_product_id })
      const wasReplacing = Boolean(replacing)
      const done = wasReplacing ? `${replacing?.product_name}을(를) ${offer.product_name}(으)로 교체했습니다.` : `${offer.product_name}을(를) ${ingredient.ingredient_name}에 연결했습니다.`
      setSelected(null); setConfirmed(false)
      setReplacing(null)
      onLinked()
      // 새 연결이 끝나면 바로 다음 미연결 식재료로 넘어가거나 창을 닫는다(교체는 같은 식재료 관리라 머문다).
      if (!wasReplacing && onAdvance) { onAdvance(done); return }
      setMessage(done)
      setRevision(value => value + 1)
    } catch (e) { setError(e instanceof Error ? e.message : '연결 저장에 실패했습니다.') }
    finally { busy.current = false; setSaving(false) }
  }
  const remove = async () => {
    if (!removing || busy.current) return
    busy.current = true; setSaving(true); setError(''); setMessage('')
    try {
      await unlinkIngredientProduct(accountId, ingredient.ingredient_id, removing.account_ingredient_product_id, getLocalUserId())
      setMessage(`${removing.product_name}의 현재 거래처 연결을 해제했습니다.`)
      setRemoving(null); setReplacing(null); onLinked(); setRevision(value => value + 1)
    } catch (e) { setError(e instanceof Error ? e.message : '해제에 실패했습니다.') }
    finally { busy.current = false; setSaving(false) }
  }
  return createPortal(<div className="ingredient-link-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
    <section className="ingredient-link-dialog" role="dialog" aria-modal="true" aria-labelledby="ingredient-link-title" tabIndex={-1} ref={dialogRef} onKeyDown={e => {
      if (e.key === 'Escape' && !saving) { e.stopPropagation(); onClose() }
      if (e.key === 'Tab') {
        const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')]
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }}>
      <header><div><h2 id="ingredient-link-title">공급상품 연결</h2><p>{ingredient.ingredient_name} · 기준단위 {ingredient.base_unit}{onAdvance ? ` · 연결하면 ${nextIngredientName ? `다음 미연결 식재료(${nextIngredientName})로 이동` : '창을 닫습니다'}` : ''}</p></div><button disabled={saving} onClick={onClose}>닫기</button></header>
      {notice && <p role="status" className="ingredient-link-success ingredient-link-notice">{notice}</p>}
      <section className="ingredient-link-current" aria-label="현재 거래처 연결 상품">
        <h3>현재 거래처 연결 상품</h3>
        <p>해제·교체는 현재 거래처 전체에 적용됩니다. 기존 발주·입고·재고 이력은 유지됩니다.</p>
        {linksLoading ? <p>연결 목록 조회 중…</p> : linksError ? <p role="alert" className="ingredient-link-error">{linksError}</p> : <>
          {!links.some(item => item.active_yn === 'Y') && <p>사용 중인 연결 상품이 없습니다.</p>}
          {links.map(item => <div className="ingredient-link-current-row" key={item.account_ingredient_product_id}><div><strong>{item.product_name}</strong><small>{item.supplier_name} · {item.supplier_item_code} · {item.active_yn === 'Y' ? '사용 중' : '연결 해제됨'}</small></div>{item.active_yn === 'Y' && <div><button disabled={saving} onClick={() => setCostProduct(item.supplier_product_id)}>편성 기준단가 관리</button><button disabled={saving} onClick={() => { setReplacing(item); setRemoving(null); setSelected(null); setConfirmed(false); setKeyword(''); setMessage('') }}>상품 교체</button><button disabled={saving} onClick={() => { setRemoving(item); setReplacing(null); setSelected(null); setMessage('') }}>연결 해제</button></div>}</div>)}
        </>}
        {removing && <div className="ingredient-link-selection"><p><strong>{removing.product_name}</strong>을 현재 거래처의 발주 후보에서 제외할까요? 기존 재고를 삭제하거나 다른 상품으로 옮기지는 않습니다.</p><button disabled={saving} onClick={() => setRemoving(null)}>취소</button><button disabled={saving} onClick={() => void remove()}>해제 확인</button></div>}
        {replacing && <div className="ingredient-link-selection"><strong>교체할 기존 상품: {replacing.product_name}</strong><p>아래에서 새 상품을 선택해주세요. 저장 시 기존 상품은 현재 거래처에서 해제하고 새 상품을 활성화합니다.</p><button disabled={saving} onClick={() => { setReplacing(null); setSelected(null); setConfirmed(false) }}>교체 취소</button></div>}
      </section>
      {costProduct && <PlanningCostEditor key={`existing/${costProduct}`} accountId={accountId} ingredientId={ingredient.ingredient_id} productId={costProduct} disabled={saving} onSaved={onLinked} />}
      <div className={`ingredient-link-columns${removing ? ' is-single' : ''}`}>
      {!removing && <section className="ingredient-link-suggestions" aria-label="추천 상품">
        <h3>추천 상품</h3>
        {suggestionsLoading ? <p role="status">추천 상품을 찾는 중입니다.</p> : !suggestedOffers.length ? <p>추천할 상품이 없습니다. 아래에서 검색해주세요.</p> : <ul>
          {suggestedOffers.map(({ suggestion, offer }) => <li key={suggestion.supplier_offer_id}>
            <div><strong>{suggestion.product_name}</strong>
              <small>{suggestion.supplier_name} · {suggestion.supplier_item_code} · 1 {offer?.order_unit || '발주단위'} = {suggestion.base_qty.toLocaleString()} {suggestion.base_unit}{suggestion.purchase_price > 0 ? ` · ${suggestion.purchase_price.toLocaleString()}원` : ''}</small>
              <small className="ingredient-link-reasons">{suggestion.reasons.join(' · ')}</small>
              {suggestion.warning && <small className="ingredient-link-error">{suggestion.warning}</small>}</div>
            <button type="button" className="menu-manager-select-button" disabled={saving || loading || !offer}
              title={offer ? '' : '위의 공급사·사업장을 전체로 바꾸면 선택할 수 있습니다'}
              onClick={() => offer && void linkSuggested(offer, suggestion)}>{replacing ? '이 상품으로 교체' : '연결'}</button>
          </li>)}
        </ul>}
      </section>}
      <section className="ingredient-link-picker" aria-label="상품 선택">
      <h3>상품 선택</h3>
      <div className="ingredient-link-filters">
        <label>공급사 · 사업장<select aria-label="연결할 공급사 사업장" value={siteId} disabled={saving} onChange={e => { setSiteId(e.target.value); setMessage(''); try { localStorage.setItem(siteKey, e.target.value) } catch { /* 기억 못 해도 동작 */ } }}><option value="">전체 공급사·사업장</option>{sites.map(item => <option key={item.supplier_account_site_id} value={item.supplier_account_site_id}>{item.supplier_name} · {item.external_site_name || item.external_site_code}</option>)}</select></label>
        <label>납품일<input aria-label="상품 연결 납품일" type="date" value={date} disabled={saving} onChange={e => { setDate(e.target.value); setMessage('') }} /></label>
        <label>상품 검색<input aria-label="연결 상품 검색" value={keyword} disabled={saving} onChange={e => setKeyword(e.target.value)} placeholder="상품명 또는 상품코드" /></label>
        <button disabled={saving || loading || !accountId} onClick={() => setRevision(value => value + 1)}>다시 조회</button>
      </div>
      <p>현재 거래처에 동기화된 상품을 조회합니다. 아워홈도 사업장·상품이 저장되어 있으면 선택할 수 있습니다.</p>
      {error && <p role="alert" className="ingredient-link-error">{error}</p>}
      {message && <p role="status" className="ingredient-link-success">{message}</p>}
      {loading ? <p role="status">상품 정보를 불러오는 중입니다.</p> : !sites.length ? <p>이 거래처에 지정된 공급사 사업장이 없습니다. <Link to="/order_manager/supplier-sites">공급사 사업장 매핑</Link>에서 먼저 지정해주세요.</p> : !offers.length && !searchKeyword.trim() ? <p>선택한 납품일에 저장된 상품이 없습니다. <Link to="/order_manager/suppliers">공급사 통합 연동</Link>에서 판가 기간을 확인하고 동기화해주세요.</p> : <>
        <div className="ingredient-link-table"><table><thead><tr><th>선택</th><th>상품명 / 코드</th><th>발주 규격</th><th>납품일 가격</th><th>연결 상태</th></tr></thead><tbody>{filtered.slice((page - 1) * 20, page * 20).map(offer => {
          const qty = pickPack(offer.pack_options, ingredient.base_unit)?.converted ?? 0
          const packText = offer.pack_options.filter(option => option.base_qty > 0).map(option => `${option.base_qty.toLocaleString()} ${option.base_unit}`).join(' / ') || '규격 확인 필요'
          return <tr key={offer.supplier_offer_id}><td><input type="radio" name="ingredient-link-product" aria-label={`${offer.product_name} 연결 선택`} disabled={saving || Boolean(removing) || qty <= 0 || !offer.supplier_product_id || replacing?.supplier_product_id === offer.supplier_product_id} checked={selected?.supplier_offer_id === offer.supplier_offer_id} onChange={() => { setSelected(offer); setConfirmed(false); setMessage('') }} /></td><td>{offer.product_name}<small>{offer.supplier_name} · {offer.supplier_item_code}</small></td><td>1 {offer.order_unit} = {packText}<small>{qty > 0 ? `${qty.toLocaleString()} ${ingredient.base_unit}` : `단위 환산 불가 (식재료 기준단위 ${ingredient.base_unit})`}</small></td><td>{offer.purchase_price > 0 ? `${offer.purchase_price.toLocaleString()}원` : '가격 없음'}<small>{offer.orderable_yn === 'N' ? offer.availability_reason : '발주 가능'}{offer.stale ? ' · 동기화 확인 필요' : ''}</small></td><td>{linkStatus(offer)}</td></tr>
        })}</tbody></table></div>
        {!filtered.length && <p>검색 결과가 없습니다. 검색어를 줄이거나 바꿔주세요.</p>}
        {offers.length >= SEARCH_LIMIT && <p>관련도 높은 {SEARCH_LIMIT}건만 표시합니다. 검색어를 더 구체적으로 입력해주세요.</p>}
        <nav aria-label="공급상품 페이지"><span>{filtered.length}건 · {page}/{pages}</span><button disabled={saving || page <= 1} onClick={() => setPage(value => value - 1)}>이전</button><button disabled={saving || page >= pages} onClick={() => setPage(value => value + 1)}>다음</button></nav>
      </>}
      {selected && <div className="ingredient-link-selection"><strong>{selected.product_name} → {ingredient.ingredient_name}</strong><p>1 {selected.order_unit} = {converted.toLocaleString()} {ingredient.base_unit}. 상품 규격과 보관상태가 레시피 식재료에 맞는지 확인해주세요.</p><p>선택한 거래처의 모든 메뉴에 공통으로 적용됩니다. 다른 거래처의 상품 설정은 변경하지 않습니다.</p>{movingFrom && <p role="alert" className="ingredient-link-error">이 상품은 현재 이 거래처의 '{movingFrom}'에 연결되어 있습니다. 저장하면 '{ingredient.ingredient_name}'(으)로 옮겨지고 '{movingFrom}'에서는 빠집니다.</p>}<label><input type="checkbox" checked={confirmed} disabled={saving} onChange={e => setConfirmed(e.target.checked)} /> 상품 규격과 거래처 적용 범위를 확인했습니다.</label></div>}
      </section>
      </div>
      <footer><span>추천·검색 결과도 직접 고른 상품만 연결합니다(자동 연결 없음).</span><button className="menu-manager-save-button" disabled={!selected || !confirmed || converted <= 0 || saving || loading} onClick={() => void save()}>{saving ? '연결 저장 중…' : replacing ? '선택 상품으로 교체' : '선택 상품 연결'}</button></footer>
    </section>
  </div>, document.body)
}
