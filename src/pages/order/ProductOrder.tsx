import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import CatalogPreparation from '../../components/CatalogPreparation'
import { Fragment, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import TopMenuLayout from '../../components/TopMenuLayout'
import BatchOrderResults from '../../components/BatchOrderResults'
import ProductImage from '../../components/ProductImage'
import type { SupplierOffer } from '../../api/supplierIntegration'
import { lineKey, useProductOrder, SOURCE_REASON, type CartLine } from '../../features/order/useProductOrder'
import { deadlineInfo } from '../../features/order/orderDeadline'
import '../operations/MenuManager.css'
import './ProductOrder.css'
import './OrderPos.css'
import './FoodOrderExpand.css'

const PAGE_SIZE = 24
const SOURCE_TITLE = '담는 상품 모두 이 식재료 재고로 들어갑니다. 비우면 상품마다 맞힌 식재료로 담고, 장바구니에서 바꿀 수 있습니다'
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
/** 수량 한 칸 이동: 발주배수만큼, 최소 발주수량 아래로는 내려가지 않음 */
const stepQty = (line: CartLine, direction: 1 | -1) => {
  const step = line.offer.order_increment_qty || 1
  const next = Math.round((line.quantity + direction * step) * 1000) / 1000
  return Math.max(line.offer.minimum_order_qty || step, next)
}
// 2026-11-23 앱 공통 공급사 색: 웰스토리 주황 · 아워홈 파랑
const supplierTone = (code: string) => code === 'WELSTORY' ? 'is-orange' : code === 'OURHOME' ? 'is-blue' : ''
/** 기준단위 100g(100ml·1개)당 가격 — 규격이 다른 상품끼리 비교(2026-10-15 개편 시안 ⑤) */
function unitCost(offer: SupplierOffer) {
  const qty = Number(offer.base_qty) || 0
  if (!qty || !offer.purchase_price) return null
  const u = (offer.base_unit || '').toLowerCase()
  const factor = u === 'g' || u === 'ml' ? 100 : u === 'kg' || u === 'l' ? 0.1 : 1
  return { value: offer.purchase_price / qty * factor, per: u === 'g' || u === 'kg' ? '100g' : u === 'ml' || u === 'l' ? '100ml' : (offer.base_unit || '개') }
}

/** 상품 검색 발주(PC). 로직은 features/order/useProductOrder(터치와 공용). embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다 */
export default function ProductOrder({ embedded = false, favorites = false, headSlot = null }: { embedded?: boolean; favorites?: boolean; headSlot?: HTMLElement | null }) {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  return <ProductOrderContent key={accountId} accountId={accountId} initialSource={params.get('ingredient_id') || ''} embedded={embedded} favorites={favorites} headSlot={headSlot} />
}

/** 같은 기준단위(100g·100ml·개)끼리 단가 비교. 단위가 다르면 100g → 100ml → 그 외 순서로 묶는다 */
function compareUnit(a: SupplierOffer, b: SupplierOffer, direction: 1 | -1) {
  const ca = unitCost(a), cb = unitCost(b)
  if (!ca || !cb) return ca ? -1 : cb ? 1 : 0
  if (ca.per !== cb.per) return ca.per === '100g' ? -1 : cb.per === '100g' ? 1 : ca.per.localeCompare(cb.per)
  return (ca.value - cb.value) * direction
}
/** 상품 검색 정렬(2026-10-15 사용자 결정: 추천순 기본, 포장 가격과 100g당 가격을 구분해 이름에 표시) */
const SORTS = {
  recommend: { label: '추천순 (나만의 식재료·늘 쓰는 상품 먼저)', compare: (a: SupplierOffer, b: SupplierOffer) => Number(b.favorite_yn === 'Y') - Number(a.favorite_yn === 'Y') || Number(b.usual_ingredient_ids.length > 0) - Number(a.usual_ingredient_ids.length > 0) || compareUnit(a, b, 1) },
  unit_asc: { label: '100g당 낮은 순', compare: (a: SupplierOffer, b: SupplierOffer) => compareUnit(a, b, 1) },
  unit_desc: { label: '100g당 높은 순', compare: (a: SupplierOffer, b: SupplierOffer) => compareUnit(a, b, -1) },
  price_asc: { label: '포장 가격 낮은 순', compare: (a: SupplierOffer, b: SupplierOffer) => a.purchase_price - b.purchase_price },
  price_desc: { label: '포장 가격 높은 순', compare: (a: SupplierOffer, b: SupplierOffer) => b.purchase_price - a.purchase_price },
} as const
type SortKey = keyof typeof SORTS

/** 상품 카드: 사진 · 공급사 · D-N · 이름 · 규격 · 발주 상태 · 마감 일시 · 단가 · 담기 */
function OfferCard({ offer, inCart, canAdd, onAdd, cheapest, line, onQty, disabled, onFavorite }: { offer: SupplierOffer; inCart: boolean; canAdd: boolean; onAdd: () => void; cheapest: boolean; line?: CartLine; onQty: (line: CartLine, quantity: number) => void; disabled: boolean; onFavorite: () => void }) {
  const available = offer.orderability_status === 'AVAILABLE'
  const reason = offer.orderability_reason || offer.availability_reason
  const cost = unitCost(offer)
  const deadline = deadlineInfo(offer.order_deadline)
  return <article className={`pos-card${inCart ? ' is-in-cart' : ''}`}>
    <div className="pos-card__image"><ProductImage src={offer.thumbnail_url || offer.image_url} fullSrc={offer.image_url} name={offer.product_name} zoomable />
      <button type="button" className={`pos-card__heart${offer.favorite_yn === 'Y' ? ' is-on' : ''}`} aria-pressed={offer.favorite_yn === 'Y'}
        aria-label={`${offer.product_name} 나만의 식재료${offer.favorite_yn === 'Y' ? ' 해제' : ' 지정'}`} title="나만의 식재료(하트)" onClick={onFavorite}>{offer.favorite_yn === 'Y' ? '♥' : '♡'}</button></div>
    <div className="pos-card__meta">
      <span className={`pos-chip ${supplierTone(offer.supplier_code)}`}>{offer.supplier_name}</span>
      {offer.lead_time_days != null && offer.lead_time_days > 0 && <span className="pos-chip">D-{offer.lead_time_days}</span>}
      {offer.favorite_yn === 'Y' ? <span className="rd-chip is-info pos-card__tag">나만의 식재료</span> : cheapest ? <span className="rd-chip is-ok pos-card__tag">가장 저렴</span> : offer.usual_ingredient_ids.length ? <span className="rd-chip is-done pos-card__tag">늘 쓰는 상품</span> : null}
    </div>
    <strong className="pos-card__name" title={offer.product_name}>{offer.product_name}</strong>
    <span className="pos-card__sub">{offer.supplier_item_code} · {offer.base_qty}{offer.base_unit}/{offer.order_unit}</span>
    <span className={`pos-card__status ${available ? 'is-ok' : 'is-warn'}`} title={reason}>{available ? '발주 가능' : reason || '납품일자·마감 확인 요망'}</span>
    {deadline && !deadline.passed
      ? <span className={`pos-card__deadline${deadline.soon ? ' is-soon' : ''}`} title={reason}><span><span aria-hidden>⏰</span> 마감 {deadline.text}</span>{deadline.left ? <small className="pos-card__left">{deadline.left}</small> : null}</span>
      : offer.orderability_status === 'REVIEW_REQUIRED' ? <span className="pos-card__deadline is-unknown" title={reason}><span><span aria-hidden>⏰</span> 마감 시간 미확인</span></span> : null}
    <div className="pos-card__price-row"><b className="pos-card__price">{won(offer.purchase_price)}<small>/{offer.order_unit}</small></b>{cost ? <span className="rd-muted">{cost.per}당 {won(cost.value)}</span> : null}</div>
    <div className="pos-card__foot">
      {line ? <span className="rd-stepper">
        <button type="button" aria-label={`${offer.product_name} 수량 줄이기`} disabled={disabled || line.quantity <= line.offer.minimum_order_qty} onClick={() => onQty(line, stepQty(line, -1))}>−</button>
        <input aria-label={`${offer.product_name} 발주수량`} disabled={disabled} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => onQty(line, Number(e.target.value))} />
        <button type="button" aria-label={`${offer.product_name} 수량 늘리기`} disabled={disabled} onClick={() => onQty(line, stepQty(line, 1))}>+</button>
      </span> : null}
      <button type="button" className={`rd-btn pos-add${inCart ? ' is-selected' : ''}`} disabled={!canAdd} onClick={onAdd} aria-label={`${offer.product_name} 담기`}>{inCart ? '담김 ✓' : '담기'}</button>
    </div>
  </article>
}

function ProductOrderContent({ accountId, initialSource, embedded, favorites, headSlot }: { accountId: string; initialSource: string; embedded: boolean; favorites: boolean; headSlot: HTMLElement | null }) {
  const {
    sites, ingredients, source, chooseSource, site, setSite, date, changeDate, query, setQuery, cart, busy, locked, message, result, page, setPage,
    search, order, newCart, canAdd, addToCart, setLineQuantity, setLineSource, ingredientName, removeLine, filtered, groups, cartTotal, canOrder, toggleFavorite, favoriteMode,
  } = useProductOrder(accountId, initialSource, favorites)
  // 정렬은 보는 순서만 바꾼다(무엇을 발주할지는 담기로 사용자가 고름). 기본 추천순 = 늘 쓰는 상품 먼저 → 100g당 싼 순
  const [sort, setSort] = useState<SortKey>('recommend')
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [onlyOrderable, setOnlyOrderable] = useState(false)
  const shown = filtered.filter(o => (!onlyLinked || o.usual_ingredient_ids.length > 0) && (!onlyOrderable || (o.orderable_yn === 'Y' && o.orderability_status === 'AVAILABLE')))
  const sorted = [...shown].sort(SORTS[sort].compare)
  const cheapestId = (() => {
    const orderable = shown.filter(o => o.orderable_yn === 'Y' && unitCost(o))
    const per = orderable.some(o => unitCost(o)?.per === '100g') ? '100g' : unitCost(orderable[0] || shown[0] || ({} as SupplierOffer))?.per
    const same = orderable.filter(o => unitCost(o)?.per === per)
    return same.length > 1 ? same.reduce((best, o) => (unitCost(o)!.value < unitCost(best)!.value ? o : best)).supplier_offer_id : null
  })()
  const lineOf = (offer: SupplierOffer) => cart.find(line => line.offer.supplier_offer_id === offer.supplier_offer_id && line.date === date)
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const inCart = (offer: SupplierOffer) => cart.some(line => line.offer.supplier_offer_id === offer.supplier_offer_id && line.date === date)

  // 조회조건: 발주하기 안(headSlot 있음)에서는 머리 줄 검색창 자리에 한 줄로(♥ 버튼은 같은 줄 '♥ 나만의 식재료' 탭이 대신), 따로 연 화면에서는 예전처럼 위 칸에
  const canSearch = !busy && Boolean(date) && Boolean(accountId)
  const sourceSelect = <select className="rd-input" aria-label="재고에 넣을 식재료" title={SOURCE_TITLE} disabled={busy || locked} value={source} onChange={e => chooseSource(e.target.value)}><option value="">{headSlot ? '재고 식재료: 상품마다 자동' : '상품마다 자동'}</option>{ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}</select>
  const siteSelect = <select className="rd-input" aria-label="공급사 · 사업장" disabled={busy} value={site} onChange={e => { setSite(e.target.value); setPage(1) }}><option value="">전체 공급사·사업장</option>{sites.map(s => <option key={s.supplier_account_site_id} value={s.supplier_account_site_id}>{s.supplier_name} · {s.external_site_name || s.external_site_code}</option>)}</select>
  const dateInput = <input className="rd-input" aria-label="납품일" title="납품일" disabled={busy} type="date" value={date} onChange={e => changeDate(e.target.value)} />
  const favoriteButton = <button type="button" className={headSlot ? `rd-btn${favoriteMode ? ' is-selected' : ''}` : favoriteMode ? 'is-primary' : ''} disabled={!canSearch} onClick={() => void search(true)} title="하트를 누른 웰스토리·아워홈 상품만 봅니다">♥ 나만의 식재료</button>
  const headTools = <>
    {sourceSelect}{siteSelect}{dateInput}
    <form className="rd-order__search" role="search" onSubmit={event => { event.preventDefault(); if (canSearch) void search() }}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#5B6660" strokeWidth="2" fill="none" /><path d="M16 16 L21 21" stroke="#5B6660" strokeWidth="2" strokeLinecap="round" /></svg>
      <input type="search" className="rd-bare-input" aria-label="상품 검색" placeholder="상품명 · 코드 · 공급사" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} />
      <button type="submit" className="rd-btn is-selected" disabled={!canSearch}>{busy ? '조회 중…' : '검색'}</button>
    </form>
  </>

  const body = <div className="pos-order rd rd-pos">
    {headSlot ? createPortal(headTools, headSlot) : <section className="pos-filters" aria-label="상품 조회 조건">
      <label title={SOURCE_TITLE}>재고에 넣을 식재료{sourceSelect}</label>
      <label>공급사 · 사업장{siteSelect}</label>
      <label>납품일{dateInput}</label>
      <label className="pos-filters__search">상품 검색<input placeholder="상품명 · 코드 · 공급사" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} onKeyDown={e => { if (e.key === 'Enter' && canSearch) void search() }} /></label>
      <button type="button" className="is-primary" disabled={!canSearch} onClick={() => void search()}>{busy ? '조회 중…' : '상품 조회'}</button>
      {favoriteButton}
    </section>}
    <div className="pos-notes">
      <CatalogPreparation key={accountId + date} accountId={accountId} date={date} onReady={() => void search(favorites || favoriteMode)} />
      {message && <p role="status" className="pos-message">{message}</p>}
    </div>

    {favoriteMode ? <FavoriteOrderList sorted={sorted} shown={shown} cart={cart} date={date} busy={busy} locked={locked} canAdd={canAdd} addToCart={addToCart} removeLine={removeLine}
      setLineQuantity={setLineQuantity} setLineSource={setLineSource} ingredients={ingredients} ingredientName={ingredientName} toggleFavorite={toggleFavorite}
      groups={groups} cartTotal={cartTotal} canOrder={canOrder} order={order} newCart={newCart} accountId={accountId} /> :
    <div className="pos-layout">
      <section className="pos-catalog" aria-label="공급상품">
        <header className="pos-catalog__head">
          <h2 className="rd-h2">{favoriteMode ? `나만의 식재료 ${shown.length}개` : query.trim() ? `'${query.trim()}' 상품 ${shown.length}개` : `공급상품 ${shown.length}개`}{shown.length !== filtered.length ? <small className="rd-muted rd-fs-sm"> / 전체 {filtered.length}</small> : null}</h2>
          <div className="rd-pos__tools">
            <div className="rd-pills" role="group" aria-label="거르기">
              <button type="button" aria-pressed={onlyLinked} className={onlyLinked ? 'is-active' : ''} onClick={() => { setOnlyLinked(v => !v); setPage(1) }}>늘 쓰는 상품만</button>
              <button type="button" aria-pressed={onlyOrderable} className={onlyOrderable ? 'is-active' : ''} onClick={() => { setOnlyOrderable(v => !v); setPage(1) }}>발주 가능만</button>
            </div>
            <select className="rd-input" aria-label="정렬" value={sort} onChange={e => { setSort(e.target.value as SortKey); setPage(1) }}>
              {(Object.keys(SORTS) as SortKey[]).map(key => <option key={key} value={key}>{SORTS[key].label}</option>)}
            </select>
          </div>
        </header>
        {shown.length ? <div className="pos-grid">
          {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(offer =>
            <OfferCard key={offer.supplier_offer_id} offer={offer} inCart={inCart(offer)} canAdd={canAdd(offer)} onAdd={() => addToCart(offer)}
              cheapest={offer.supplier_offer_id === cheapestId} line={lineOf(offer)} onQty={setLineQuantity} disabled={busy || locked} onFavorite={() => void toggleFavorite(offer)} />)}
        </div> : <p className="pos-empty">{busy ? '상품 조회 중' : filtered.length ? '거르기 조건에 맞는 상품 없음 · 거르기 해제 요망' : favoriteMode ? '나만의 식재료가 없습니다 · 상품 카드의 ♡를 눌러 지정 요망' : '조회된 상품 없음 · 납품일 선택 후 상품 조회 요망'}</p>}
        {shown.length > PAGE_SIZE && <nav className="pos-pager" aria-label="상품 쪽 이동">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button>
          <span>{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>다음</button>
        </nav>}
      </section>

      <aside className="pos-cart" aria-label="현재 발주">
        <header className="pos-cart__head"><h2>현재 발주</h2><span className="pos-chip is-green">발주서 {Object.keys(groups).length}건</span></header>
        {!cart.length && <p className="pos-empty">담은 상품 없음 · 왼쪽에서 상품 담기 요망</p>}
        {Object.entries(groups).map(([key, lines]) => <section key={key} className="pos-cart__group">
          <h3><span className={`pos-chip ${supplierTone(lines[0].offer.supplier_code)}`}>{lines[0].offer.supplier_name}</span>{lines[0].offer.external_site_name || lines[0].offer.external_site_code} · {lines[0].date}</h3>
          {lines.map(line => <div key={lineKey(line)} className="pos-line">
            <span className="pos-line__image"><ProductImage compact src={line.offer.thumbnail_url || line.offer.image_url} name={line.offer.product_name} /></span>
            <span className="pos-line__info"><strong title={line.offer.product_name}>{line.offer.product_name}</strong><small>{won(line.offer.purchase_price)} / {line.offer.order_unit}</small></span>
            <span className="pos-stepper">
              <button type="button" aria-label={`${line.offer.product_name} 수량 줄이기`} disabled={busy || locked || line.quantity <= line.offer.minimum_order_qty} onClick={() => setLineQuantity(line, stepQty(line, -1))}>−</button>
              <input aria-label={`${line.offer.product_name} 발주수량`} disabled={busy || locked} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => setLineQuantity(line, Number(e.target.value))} />
              <button type="button" aria-label={`${line.offer.product_name} 수량 늘리기`} disabled={busy || locked} onClick={() => setLineQuantity(line, stepQty(line, 1))}>+</button>
            </span>
            <b className="pos-line__amount">{won(line.quantity * line.offer.purchase_price)}</b>
            {/* 재고 식재료: 위에서 고른 것 또는 서버가 맞힌 것. 틀리면 여기서 바꾼다(2026-10-23) */}
            <span className={`pos-line__stock${line.source ? '' : ' is-empty'}`}>
              <span aria-hidden>→</span>
              <select aria-label={`${line.offer.product_name} 재고에 넣을 식재료`} disabled={busy || locked} value={line.source} onChange={e => setLineSource(line, e.target.value)}>
                <option value="">입고할 때 고르기</option>
                {line.source && !ingredientName(line.source) && <option value={line.source}>{line.offer.suggested_ingredient_name || line.source}</option>}
                {ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name} 재고로</option>)}
              </select>
              {line.source && line.sourceBy && <small>{SOURCE_REASON[line.sourceBy]}</small>}
            </span>
            <button type="button" className="pos-line__remove" aria-label={`${line.offer.product_name} 빼기`} disabled={busy || locked} onClick={() => removeLine(line)}>×</button>
          </div>)}
        </section>)}
        <dl className="pos-cart__sum">
          <div><dt>담은 품목</dt><dd>{cart.length}개</dd></div>
          <div><dt>발주서</dt><dd>{Object.keys(groups).length}건 (공급사·사업장·납품일별)</dd></div>
          <div className="is-total"><dt>상품금액 합계</dt><dd>{won(cartTotal)}</dd></div>
        </dl>
        <button type="button" className="is-primary pos-cart__submit" disabled={!canOrder} onClick={() => void order()}>공급사별 발주 확정</button>
        <div className="pos-cart__sub">
          <button type="button" disabled={busy} onClick={newCart}>새 발주 작성</button>
          <button type="button" disabled={busy || !accountId} onClick={() => void order(true)}>이전 요청 결과 확인</button>
        </div>
        <p className="pos-cart__hint">최종 금액·발주 가능 여부는 확정 시 공급사 기준으로 재검증</p>
      </aside>
    </div>}
    <BatchOrderResults result={result} accountId={accountId} />
  </div>
  if (embedded) return <div className="mixed-product-order">{body}</div>
  return <div className="menu-manager-page mixed-product-order"><div className="menu-manager-content"><TopMenuLayout title="상품발주">{body}</TopMenuLayout></div></div>
}

type FavoriteListProps = {
  sorted: SupplierOffer[]; shown: SupplierOffer[]; cart: CartLine[]; date: string; busy: boolean; locked: boolean
  canAdd: (offer: SupplierOffer) => boolean; addToCart: (offer: SupplierOffer) => void | Promise<void>; removeLine: (line: CartLine) => void
  setLineQuantity: (line: CartLine, quantity: number) => void; setLineSource: (line: CartLine, value: string) => void
  ingredients: { ingredient_id: string; ingredient_name: string }[]; ingredientName: (id: string) => string | undefined; toggleFavorite: (offer: SupplierOffer) => void | Promise<void>
  groups: Record<string, CartLine[]>; cartTotal: number; canOrder: boolean; order: (recover?: boolean) => void | Promise<void>; newCart: () => void; accountId: string
}

/**
 * 나만의 식재료(2026-11-23 사용자 결정: 발주하기 탭 화면 통일) — 식단표 기준과 같은 표(체크 · 상품 · 재고 식재료 · 상품 가격 · 주문 수량)와
 * 오른쪽 발주서 미리보기, '발주하기' → 최종 검토(아워홈 · 전체 · 웰스토리). 줄 단위가 식재료가 아니라 ♥ 상품이라 '재고 → 필요' 대신 '재고 식재료'.
 * 발주 경로는 예전 상품 발주(useProductOrder.order) 그대로.
 */
function FavoriteOrderList(p: FavoriteListProps) {
  const [review, setReview] = useState(false)
  const lineOf = (offer: SupplierOffer) => p.cart.find(line => line.offer.supplier_offer_id === offer.supplier_offer_id && line.date === p.date)
  const disabled = p.busy || p.locked
  const reviewCard = (code: 'OURHOME' | 'WELSTORY' | '', label: string) => {
    const lines = p.cart.filter(line => !code || line.offer.supplier_code === code)
    const total = lines.reduce((sum, line) => sum + line.quantity * line.offer.purchase_price, 0)
    return <article className={`rd-review__card${code ? ` is-${code}` : ' is-all'}`} aria-label={`${label} 발주서 미리보기`}>
      {code ? <p className="rd-review__legend"><span className={`is-${code}`}>{label}</span></p> : null}
      <h3>발주서 미리보기</h3>
      {!code ? <p className="rd-review__legend"><span className="is-OURHOME">아워홈</span><span className="is-WELSTORY">삼성웰스토리</span></p> : null}
      <ul>{lines.map(line => <li key={lineKey(line)}><span>{line.offer.product_name}<small>{line.quantity}{line.offer.order_unit} · {line.date} 납품</small></span><span className={`rd-review__dot is-${line.offer.supplier_code}`} aria-hidden="true" /><b>{won(line.quantity * line.offer.purchase_price)}</b></li>)}</ul>
      {!lines.length ? <p className="rd-review__empty">담은 상품이 없어요.</p> : null}
      <div className="rd-review__total"><span>총 계</span><b>{won(total)}</b></div>
    </article>
  }
  return <div className="rd rd-order rd-fav"><div className="rd-order__grid">
    <section className="rd-card rd-order__list" aria-label="나만의 식재료">
      <div className="rd-order__list-head"><div><h2 className="rd-h2">나만의 식재료 {p.shown.length}개</h2>
        <p className="rd-muted rd-fs-sm">♥ 표시한 웰스토리·아워홈 상품이에요. 체크하거나 수량을 정해 담으면 오른쪽 발주서에 들어가요.</p></div></div>
      <div className="rd-order__split"><div className="rd-order__scroll"><div className="rd-order__table">
        <div className="rd-order__row is-head rd-fs-xs"><span /><span>사진</span><span>상품</span><span>상품 가격 (100g당 가격)</span><span>재고 식재료</span><span>주문 수량</span></div>
        {p.sorted.map(offer => {
          const line = lineOf(offer)
          const cost = unitCost(offer)
          const available = offer.orderability_status === 'AVAILABLE'
          const reason = offer.orderability_reason || offer.availability_reason
          const deadline = deadlineInfo(offer.order_deadline)
          return <Fragment key={offer.supplier_offer_id}><div className={`rd-order__row${line ? ' is-open' : ''} is-by-${offer.supplier_code}`}>
            <input aria-label={`${offer.product_name} 담기`} type="checkbox" checked={Boolean(line)} disabled={disabled || (!line && !p.canAdd(offer))}
              onChange={e => { if (e.target.checked) void p.addToCart(offer); else if (line) p.removeLine(line) }} />
            {/* 2026-11-25 사용자 결정: 체크 · 사진(110px 정사각) · 상품 · 상품 가격 · 재고 식재료 · 주문 수량 순 */}
            <span className="rd-pick__img rd-fav__img"><ProductImage zoomable src={offer.thumbnail_url || offer.image_url} fullSrc={offer.image_url} name={offer.product_name} /></span>
            <div className="rd-order__name">
              <strong className="rd-fs-md" title={offer.product_name}>{offer.product_name}</strong>
              <span className="rd-order__tags"><span className={`rd-supplier is-${offer.supplier_code}`}>{offer.supplier_name}</span>
                <button type="button" className="rd-fav__heart" aria-pressed={offer.favorite_yn === 'Y'} aria-label={`${offer.product_name} 나만의 식재료 해제`} title="나만의 식재료(하트) 해제" disabled={disabled} onClick={() => void p.toggleFavorite(offer)}>{offer.favorite_yn === 'Y' ? '♥' : '♡'}</button></span>
            </div>
            <div className="rd-order__offer">
              <span className="rd-fav__offer rd-fs-sm">
                <span><b>{won(offer.purchase_price)}</b>({offer.order_unit}){cost ? ` / ${cost.per}당 ${won(cost.value)}` : ''} · <span className={available ? 'rd-text-ok' : 'rd-text-warn'}>{available ? '발주 가능' : reason || '납품일자·마감 확인 요망'}</span></span>
                <small className="rd-muted">{offer.supplier_item_code} · {offer.base_qty}{offer.base_unit}/{offer.order_unit}{deadline && !deadline.passed ? ` · 마감 ${deadline.text}` : ''}</small>
              </span>
            </div>
            <div className="rd-order__stock rd-fs-sm">
              {line ? <select className="rd-input rd-fav__source" aria-label={`${offer.product_name} 재고에 넣을 식재료`} title="이 상품이 들어갈 재고 식재료" disabled={disabled} value={line.source} onChange={e => p.setLineSource(line, e.target.value)}>
                <option value="">입고 때</option>
                {line.source && !p.ingredientName(line.source) && <option value={line.source}>{line.offer.suggested_ingredient_name || line.source}</option>}
                {p.ingredients.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}
              </select> : <span className="rd-muted">{offer.suggested_ingredient_name || '담으면 고를 수 있어요'}</span>}
              {line?.source && line.sourceBy ? <small className="rd-muted">{SOURCE_REASON[line.sourceBy]}</small> : null}
            </div>
            <div className="rd-order__qty">
              {line ? <span className="rd-stepper">
                <button type="button" aria-label={`${offer.product_name} 수량 줄이기`} disabled={disabled || line.quantity <= line.offer.minimum_order_qty} onClick={() => p.setLineQuantity(line, stepQty(line, -1))}>−</button>
                <input aria-label={`${offer.product_name} 발주수량`} disabled={disabled} type="number" min={line.offer.minimum_order_qty} step={line.offer.order_increment_qty} value={line.quantity} onChange={e => p.setLineQuantity(line, Number(e.target.value))} />
                <button type="button" aria-label={`${offer.product_name} 수량 늘리기`} disabled={disabled} onClick={() => p.setLineQuantity(line, stepQty(line, 1))}>+</button>
              </span> : <button type="button" className="rd-btn is-selected" disabled={disabled || !p.canAdd(offer)} onClick={() => void p.addToCart(offer)}>담기</button>}
              <small className="rd-muted rd-fs-xs">{offer.order_unit} · 최소 {offer.minimum_order_qty}{line ? ` · ${won(line.quantity * offer.purchase_price)}` : ''}</small>
            </div>
          </div></Fragment>
        })}
        {!p.shown.length ? <div className="rd-order__empty">{p.busy ? '나만의 식재료를 불러오고 있어요.' : '나만의 식재료가 없어요. 상품 검색에서 ♡를 눌러 지정하세요.'}</div> : null}
      </div></div></div>
    </section>
    <aside className="rd-order__side" aria-label="발주서 미리보기">
      <div className="rd-card rd-order__summary">
        <h2 className="rd-h2 rd-order__summary-title">발주서 미리보기</h2>
        <p className="rd-order__legend rd-fs-xs"><span className="is-WELSTORY">웰스토리</span><span className="is-OURHOME">아워홈</span></p>
        {p.cart.length ? <ul className="rd-order__picked">{p.cart.map(line => <li key={lineKey(line)}><span>{line.offer.product_name}</span><i className={`rd-order__dot is-${line.offer.supplier_code}`} title={line.offer.supplier_name} /><b>{won(line.quantity * line.offer.purchase_price)}</b></li>)}</ul>
          : <p className="rd-order__empty">상품을 체크하거나 '담기'를 누르면 여기에 담겨요.</p>}
        <div className="rd-order__total"><span>총 계</span><strong>{won(p.cartTotal)}</strong></div>
        <button type="button" className="rd-btn is-primary rd-order__confirm" disabled={!p.canOrder} onClick={() => setReview(true)}>{p.cart.length ? `발주하기 · ${p.cart.length}품목` : '발주하기'}</button>
        <div className="rd-order__side-actions">
          <button type="button" className="rd-btn is-ghost" disabled={p.busy} onClick={p.newCart}>새 발주 작성</button>
          <button type="button" className="rd-btn is-ghost" disabled={p.busy || !p.accountId} onClick={() => void p.order(true)}>이전 요청 결과 확인</button>
        </div>
        <p className="rd-fs-xs rd-muted">최종 금액·발주 가능 여부는 발주할 때 공급사 기준으로 다시 검증해요.</p>
      </div>
    </aside>
    </div>
    {review ? createPortal(<div className="shortage-order-page shortage-order-overlay rd rd-preview-overlay" onClick={() => !p.busy && setReview(false)}>
      <section className="shortage-order-sheet rd-preview" role="dialog" aria-modal="true" aria-labelledby="fav-review-title" onClick={e => e.stopPropagation()}>
        <header className="rd-preview__head rd-review__head">
          <div><h2 id="fav-review-title" className="rd-h1">최종 검토</h2><span className="rd-muted rd-fs-sm">발주서 {Object.keys(p.groups).length}장(공급사·사업장·납품일별) · {p.cart.length}품목</span></div>
          <button type="button" className="rd-btn rd-icon-btn" aria-label="닫기" disabled={p.busy} onClick={() => setReview(false)}>×</button>
        </header>
        <div className="rd-preview__body"><div className="rd-review__cards">{reviewCard('OURHOME', '아워홈')}{reviewCard('', '전체')}{reviewCard('WELSTORY', '삼성웰스토리')}</div></div>
        <footer className="rd-preview__foot">
          <div><span className="rd-muted rd-fs-sm">상품금액 합계</span><strong className="shortage-order-total">{won(p.cartTotal)}</strong></div>
          <div className="rd-preview__actions">
            <button type="button" className="rd-btn" disabled={p.busy} onClick={() => setReview(false)}>돌아가서 고치기</button>
            <button type="button" className="rd-btn is-primary rd-preview__send rd-review__order" disabled={!p.canOrder} onClick={() => { setReview(false); void p.order() }}>{p.busy ? '발주 중…' : `발주하기 · 발주서 ${Object.keys(p.groups).length}장`}</button>
          </div>
        </footer>
      </section>
    </div>, document.body) : null}
  </div>
}
