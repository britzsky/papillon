import CatalogPreparation from '../../components/CatalogPreparation'
import { clearOrderCart, loadOrderCart, saveOrderCart } from '../../features/order/orderCart'
import { flushSync } from 'react-dom'
import LoadingScreen from '../../components/LoadingScreen'
import BatchOrderResults from '../../components/BatchOrderResults'
import ProductImage from '../../components/ProductImage'
import FavoriteProductHeart from '../../components/FavoriteProductHeart'
import { recoverMixedProcurement, startNewMixedProcurement } from '../../api/mixedProcurement'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import TopMenuLayout from '../../components/TopMenuLayout'
import { blockedReasons, MANUAL_MAX_ORDER_QTY, shortageStockStatus, SHORTAGE_STOCK_LABELS, type ShortageOffer, type ShortageRow } from '../../api/shortageProcurement'
import { Fragment, useEffect, useState, useMemo } from 'react'
import { getDeadlineAlertsCached } from '../../api/deadlineAlerts'
import { availableSelection, day, deliveryTerms, deliveryWarning, money, number, offerOptions, per100, taxLabel, unitCost, useShortageOrder } from '../../features/order/useShortageOrder'
import { PrintIcon } from '../../components/ActionIcons'
import './ShortageFoodOrder.css'
import './FoodOrderExpand.css'
import { confirmDialog } from '../../utils/dialog'

/**
 * embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다.
 * fixedSource: 발주하기의 기준 탭(식단표·현재 부족 재고·최근 사용량)이 정한 계산 기준. 이때 화면 안의 기준 전환은 숨긴다.
 * 식단표 기준 탭은 식단 구성 화면에서 넘어온 '구성 중인 식단(DRAFT)'도 받는다.
 */
type RowSort = 'default' | 'amount_desc' | 'amount_asc'
/** 지금 고른 상품보다 기준단위당 더 싼, 바로 시킬 수 있는 다른 상품(같은 행) */
function cheapestOther(row: ShortageRow, current: ShortageOffer) {
  const mine = unitCost(current, row.base_unit)
  if (!mine) return null
  let best: { offer: ShortageOffer; value: number } | null = null
  for (const offer of row.offers) {
    if (offer.supplier_offer_id === current.supplier_offer_id || !offer.orderable || offer.orderability_status !== 'AVAILABLE') continue
    const cost = unitCost(offer, row.base_unit)
    if (cost && cost.value < mine.value * 0.98 && (!best || cost.value < best.value)) best = { offer, value: cost.value }
  }
  return best ? { offer: best.offer, label: `${mine.per}당 ${money(Math.round(best.value))}원` } : null
}

/** recommended: 추천 발주안 탭(2026-11-23 사용자 결정으로 식단표 기준과 같은 화면) — 식단표 기준 + 늘 쓰는 상품을 미리 골라 둔 상태로 연다 */
const RECOMMENDED_OVERRIDE = { autoselect: '1', autoselect_mode: 'recommended' }
function FoodOrder({ embedded = false, fixedSource, recommended = false }: { embedded?: boolean; fixedSource?: 'PLAN' | 'STOCK' | 'INVENTORY' | 'FAVORITE_MENU'; recommended?: boolean }) {
  const { accountId, focusIngredient, criteria, chooseDelivery, chooseLastMealDay, guidanceNow, plans, sites, result, selected, setSelected, keyword, setKeyword, stockFilter, setStockFilter, autoRefresh, setAutoRefresh, setRevision, loading, error, setError, message, batchResult, setBatchResult, preview, setPreview, previewing, submitting, setSubmitting, completed, setCompleted, update, stockCounts, rows, selectionCount, selectedAmount, makePreview, submit, closePreview } = useShortageOrder(fixedSource, recommended ? RECOMMENDED_OVERRIDE : undefined)
  // 납품일 카드: 72시간 안 발주 마감 알림(식단 기준 부족)을 납품일별로 묶어 품목 수·가장 빠른 마감을 보여준다
  const [dueByDate, setDueByDate] = useState<Record<string, { items: number; text: string; at: string }>>({})
  useEffect(() => {
    if (!accountId) return
    let active = true
    getDeadlineAlertsCached(accountId, 72).then(r => {
      if (!active) return
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
      const next: Record<string, { items: number; text: string; at: string }> = {}
      for (const alert of r.alerts) {
        const when = alert.deadline.slice(0, 10) === today ? `오늘 ${alert.deadline.slice(11, 16)}` : `${Number(alert.deadline.slice(5, 7))}/${Number(alert.deadline.slice(8, 10))} ${alert.deadline.slice(11, 16)}`
        const current = next[alert.delivery_date]
        if (!current) next[alert.delivery_date] = { items: alert.items.length, text: `${alert.supplier_name} ${when} 마감`, at: alert.deadline }
        else { current.items += alert.items.length; if (alert.deadline < current.at) { current.text = `${alert.supplier_name} ${when} 마감`; current.at = alert.deadline } }
      }
      setDueByDate(next)
    }).catch(() => { if (active) setDueByDate({}) })
    return () => { active = false }
  }, [accountId])
  const blocked = (result?.ingredients || []).filter(row => !row.offers.some(o => o.orderable))
  // 줄 순서 정렬: 보는 순서만 바꾼다(고른 상품·수량은 그대로). 금액 = 고른 상품(없으면 기본 상품) × 수량
  const [rowSort, setRowSort] = useState<RowSort>('default')
  const rowAmount = (row: ShortageRow) => {
    const sel = selected[row.ingredient_id]
    const offer = row.offers.find(o => o.supplier_offer_id === sel?.supplier_offer_id) || row.offers.find(o => o.orderable)
    return offer ? (sel?.order_qty ?? offer.recommended_qty ?? 0) * offer.purchase_price : -1
  }
  const sortedRows = rowSort === 'default' ? rows : [...rows].sort((a, b) => rowSort === 'amount_desc' ? rowAmount(b) - rowAmount(a) : rowAmount(a) - rowAmount(b))
  // ---- 2026-10-15 개편(시안 ② 발주하기) 화면 계산: 로직은 useShortageOrder 그대로 ----
  const allRows = result?.ingredients || []
  const offerOf = (row: ShortageRow) => row.offers.find(o => o.supplier_offer_id === selected[row.ingredient_id]?.supplier_offer_id) || row.offers.find(o => o.orderable)
  const choose = async (row: ShortageRow, id: number) => { const next = row.offers.find(o => o.supplier_offer_id === id && o.orderable); if (next && (next.orderability_status === 'AVAILABLE' || (await confirmDialog(next.product_name + ' · ' + criteria.delivery_date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까? 확인한 경우에만 선택하세요.')))) setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: next.supplier_offer_id, order_qty: next.recommended_qty, delivery_terms_confirmed: next.orderability_status !== 'AVAILABLE' } })) }
  // 2026-11-23(사용자 시안): 식재료 줄을 누르면 그 줄 바로 아래에 웰스토리·아워홈 상품 목록이 펼쳐진다(다시 누르면 접힘).
  // 처음엔 넘어온 식재료(?ingredient_id)만 펼친다. 예전(10-29)엔 표 오른쪽 고정 칸에 보였다
  const [activeId, setActiveId] = useState(focusIngredient)
  // 포함메뉴는 '포함메뉴 !'를 눌렀을 때만 말풍선으로(바깥을 누르면 닫힘)
  const [menuTip, setMenuTip] = useState('')
  useEffect(() => {
    if (!menuTip) return
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.rd-order__menus')) setMenuTip('') }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuTip])
  /** 펼친 줄 아래 공급사 상품 목록(사진 · 단가/100g당 · 이게 더 싸요). 사진은 누르면 확대, 나머지를 누르면 그 상품으로 고른다 */
  const supplierPanel = (row: ShortageRow, code: string, label: string) => {
    const list = offerOptions(row).filter(o => o.supplier_code === code)
    const ok = list.filter(o => o.orderable).length
    const current = offerOf(row)
    // 두 공급사를 통틀어 기준단위당 가장 싼 발주 가능 상품(지금 고른 상품이 아닐 때만 '이게 더 싸요')
    const cheapest = row.offers.filter(o => o.orderable).map(o => ({ o, cost: unitCost(o, row.base_unit)?.value ?? Infinity })).sort((a, b) => a.cost - b.cost)[0]
    return <section className={`rd-order__supplier is-${code}`} aria-label={`${row.ingredient_name} ${label} 상품`}>
      <div className="rd-order__supplier-head">
        <span className={`rd-supplier is-${code}`}>{label}</span>
        <small className={ok ? 'rd-muted' : 'rd-text-warn'}>{ok ? `발주 가능 ${ok}개` : '발주 가능한 상품 없음'}{list.length > ok ? ` · 불가 ${list.length - ok}개` : ''}</small>
      </div>
      <div className="rd-order__supplier-list">
        {list.map(o => { const on = o.supplier_offer_id === current?.supplier_offer_id
          return <div key={o.supplier_offer_id} className={`rd-pick${on ? ' is-on' : ''}${!o.orderable || loading ? ' is-disabled' : ''}`} title={o.product_name}
            onClick={e => { if (o.orderable && !loading && !(e.target as HTMLElement).closest('.rd-pick__img')) choose(row, o.supplier_offer_id) }}>
            <span className="rd-pick__img"><ProductImage zoomable src={o.thumbnail_url || o.image_url || undefined} fullSrc={o.image_url || undefined} name={o.product_name} /></span>
            <button type="button" className="rd-pick__body" disabled={!o.orderable || loading} aria-pressed={on}>
              <span className="rd-pick__price">{o.orderable ? <><b>{money(o.purchase_price)}원</b>({o.order_unit}){per100(o, row.base_unit) ? <> / {per100(o, row.base_unit)}</> : null}</> : <span className="rd-text-warn">{o.availability_reason || '발주 불가'}</span>}</span>
              <span className="rd-pick__name">{o.supplier_offer_id === row.recommended_offer_id ? <em>★ 늘 쓰는</em> : null}{o.product_name}</span>
              {on ? <small className="rd-pick__tag is-on">✓ 선택한 상품</small> : o.orderable && cheapest && cheapest.o.supplier_offer_id === o.supplier_offer_id && row.offers.filter(x => x.orderable).length > 1 ? <small className="rd-pick__tag is-cheap">이게 더 싸요 ↓</small> : null}
            </button>
          </div> })}
        {!list.length ? <p className="rd-order__empty">연결된 상품이 없어요.</p> : null}
      </div>
    </section>
  }
  const setQty = (row: ShortageRow, offer: ShortageOffer, value: number) => setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, delivery_terms_confirmed: current[row.ingredient_id]?.delivery_terms_confirmed, order_qty: value } }))
  // 고른 품목(발주서 미리보기 줄): 식재료 · 공급사 · 금액
  const picked = Object.values(selected).flatMap(sel => {
    const row = allRows.find(r => r.ingredient_id === sel.ingredient_id); const offer = row?.offers.find(o => o.supplier_offer_id === sel.supplier_offer_id)
    return row && offer ? [{ id: row.ingredient_id, name: row.ingredient_name, offer, amount: (sel.order_qty || 0) * offer.purchase_price }] : []
  })
  const groups = picked.reduce<Record<string, { name: string; code: string; site: string; terms: string; items: typeof picked; amount: number }>>((acc, item) => {
    const offer = item.offer
    const key = offer.supplier_code + ':' + offer.external_site_code
    const group = acc[key] ||= { name: offer.supplier_name, code: offer.supplier_code, site: offer.external_site_name || offer.external_site_code, terms: deliveryTerms(offer), items: [], amount: 0 }
    group.items.push(item); group.amount += item.amount
    return acc
  }, {})
  const deliveryDays = Array.from(new Set([day(1), day(2), day(3), day(4), day(5), day(6), day(7), criteria.delivery_date].filter(Boolean))).sort().slice(0, 8)
  const dayLabel = (value: string) => { const d = new Date(`${value}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()} ${'일월화수목금토'[d.getDay()]}` }
  const dayHint = (value: string) => value === day() ? '오늘' : value === day(1) ? '내일' : value === day(2) ? '모레' : ''
  // 조회 조건(식단표·기간·사업장·자동 계산)은 자주 바꾸지 않아 접어 둔다. 납품일은 위 납품일 줄에서 고른다
  const [showFilters, setShowFilters] = useState(false)
  // 납품일을 고르면 식단 기준은 그 납품이 맡는 기간(다음 날 ~ 다음 납품일)으로 바뀐다(useShortageOrder.chooseDelivery)
  const pickDay = chooseDelivery
  const shift = (value: string, days: number) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
  const lastMealOptions = Array.from(new Set([...Array.from({ length: 7 }, (_, i) => shift(criteria.date_from, i)), criteria.date_to])).sort()

  // 발주서 확인 창: 공급사·사업장별 발주서 묶음과 납품일·마감 경고 품목 수
  const previewSheets = Object.values((preview?.items || []).reduce<Record<string, { key: string; code: string; name: string; site: string; terms: string; amount: number; rows: NonNullable<typeof preview>['items'] }>>((acc, row) => {
    const key = row.offer.supplier_code + ':' + row.offer.external_site_code
    const sheet = acc[key] ||= { key, code: row.offer.supplier_code, name: row.offer.supplier_name, site: row.offer.external_site_name || row.offer.external_site_code, terms: deliveryTerms(row.offer), amount: 0, rows: [] }
    sheet.rows.push(row); sheet.amount += Number(row.item_amount) || 0
    return acc
  }, {}))
  // 장바구니(2026-11-23, 태블릿과 같은 규칙): 고른 품목을 이 기기에 임시 저장 → '장바구니 불러오기'. 발주를 마치면 비운다
  const cartSource = recommended ? 'RECOMMENDED' : fixedSource || criteria.source || 'PLAN'
  const [cartVersion, setCartVersion] = useState(0)
  const [cartNotice, setCartNotice] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  useEffect(() => { if (completed) clearOrderCart(accountId, cartSource) }, [completed, accountId, cartSource])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cartVersion: 담은 뒤 다시 읽기
  const storedCart = useMemo(() => loadOrderCart(accountId, cartSource), [accountId, cartSource, cartVersion])
  const cart = completed ? null : storedCart
  const putInCart = () => {
    const saved = saveOrderCart(accountId, cartSource, criteria.delivery_date, selected)
    setCartVersion(v => v + 1)
    setCartNotice(saved ? `장바구니에 ${saved.items.length}품목을 담아 두었어요. 이 기기에서 '장바구니 불러오기'로 다시 담을 수 있어요.` : '담은 품목이 없어 장바구니를 비웠어요.')
  }
  const restoreCart = () => {
    if (!cart) return
    const byId = new Map((result?.ingredients || []).map(row => [row.ingredient_id, row]))
    const next: typeof selected = {}
    let skipped = 0
    for (const item of cart.items) {
      const offer = byId.get(item.ingredient_id)?.offers.find(x => x.supplier_offer_id === item.supplier_offer_id && x.orderable)
      if (offer) next[item.ingredient_id] = { ...item }; else skipped += 1
    }
    setSelected(current => ({ ...current, ...next }))
    setCartNotice(`장바구니에서 ${Object.keys(next).length}품목을 다시 담았어요.${skipped ? ` ${skipped}품목은 지금 목록에 없거나 발주할 수 없어 빠졌어요.` : ''}${cart.delivery_date && cart.delivery_date !== criteria.delivery_date ? ` 담을 때 납품일은 ${cart.delivery_date}였어요.` : ''}`)
  }
  const reviewCard = (code: 'OURHOME' | 'WELSTORY' | '', label: string) => {
    const list = (preview?.items || []).filter(row => !code || row.offer.supplier_code === code)
    const total = list.reduce((sum, row) => sum + Number(row.item_amount || 0), 0)
    return <article className={`rd-review__card${code ? ` is-${code}` : ' is-all'}`} aria-label={`${label} 발주서 미리보기`}>
      {code ? <p className="rd-review__legend"><span className={`is-${code}`}>{label}</span></p> : null}
      <h3>발주서 미리보기</h3>
      {!code ? <p className="rd-review__legend"><span className="is-OURHOME">아워홈</span><span className="is-WELSTORY">삼성웰스토리</span></p> : null}
      <ul>{list.map(row => <li key={row.ingredient_id}><span>{row.ingredient_name}<small>{row.offer.product_name} · {number(row.order_qty)}{row.offer.order_unit}</small></span><span className={`rd-review__dot is-${row.offer.supplier_code}`} aria-hidden="true" /><b>{money(row.item_amount)}원</b></li>)}</ul>
      {!list.length ? <p className="rd-review__empty">담은 품목이 없어요.</p> : null}
      <div className="rd-review__total"><span>총 계</span><b>{money(total)}원</b></div>
    </article>
  }
  const printPreview = () => { flushSync(() => setShowDetail(true)); window.print() }
  const previewWarnings = preview ? preview.items.filter(row => deliveryWarning(row.offer, preview.criteria.delivery_date, guidanceNow)).length : 0

  const body = <div className="rd rd-order">
    {/* 2026-10-16 정리(사용자 요청): 납품일은 m버전처럼 한 줄 칸. 순서 = ① 납품일 → ② 식재료 고르기·수량 → ③ 오른쪽 발주서 확인. 조회 조건은 버튼으로 펼침 */}
    <div className="rd-order__bar">
      <div className="rd-daystrip" role="tablist" aria-label="납품일">
        {deliveryDays.map(value => { const due = dueByDate[value]; const d = new Date(`${value}T00:00:00`); const hint = dayHint(value)
          return <button key={value} type="button" role="tab" aria-selected={criteria.delivery_date === value} title={due ? `${due.text} · 안 시킨 식재료 ${due.items}개` : undefined}
            className={`rd-daystrip__day${criteria.delivery_date === value ? ' is-active' : ''}${due ? ' is-due' : ''}`} onClick={() => pickDay(value)}>
            <strong>{'일월화수목금토'[d.getDay()]}요일</strong>
            <small>{d.getMonth() + 1}.{d.getDate()} 납품</small>
            {due ? <span className="rd-daystrip__badge is-due">{due.items}개 · {due.text.split(' ').slice(-2, -1).join(' ')}</span> : hint ? <span className="rd-daystrip__badge">{hint}</span> : null}
          </button> })}
      </div>
      <div className="rd-order__bar-side">
        <span className="rd-order__prep rd-fs-sm"><CatalogPreparation key={accountId + criteria.delivery_date} accountId={accountId} date={criteria.delivery_date} onReady={() => setRevision(n => n + 1)} /></span>
        <button type="button" className={`rd-btn${showFilters ? ' is-selected' : ''}`} aria-expanded={showFilters} aria-controls="order-filters" onClick={() => setShowFilters(value => !value)}>조회 조건 {showFilters ? '접기' : '보기'}</button>
      </div>
    </div>
    {criteria.delivery_date === guidanceNow.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) ? <p className="rd-text-warn rd-fs-sm rd-order__today" role="status">당일 납품 선택 · D-1 이상 품목은 납품일자 변경 요망</p> : null}
    {criteria.source === 'PLAN' && criteria.date_from ? <p className="rd-order__cover rd-fs-sm" aria-label="이 납품으로 쓸 식단">
      <b>{dayLabel(criteria.delivery_date)} 납품</b>으로 쓸 식단 <b>{dayLabel(criteria.date_from)}</b> ~
      <select className="rd-input" aria-label="마지막 식단일" value={criteria.date_to} onChange={e => chooseLastMealDay(e.target.value)}>
        {lastMealOptions.map(value => <option key={value} value={value}>{dayLabel(value)}</option>)}
      </select>
      <span className="rd-muted rd-fs-xs">기본은 다음 납품일까지(일요일 납품 없음) · 더 길게 받으려면 마지막 식단일을 늘리세요 · 그 전 식단이 쓸 양은 먼저 빼고 계산해요</span>
    </p> : null}

    {showFilters ? <section id="order-filters" className="rd-card rd-order__filters" aria-label="조회 조건">
      <section className="shortage-order-filters" aria-label="부족재고 조회 기준">
        {criteria.source === 'DRAFT' ? <span className="shortage-order-basis"><em>조회 기준</em><b>저장 전 식단의 메뉴·식수 기준</b></span> : criteria.source === 'STOCK' ? <span className="shortage-order-basis"><em>조회 기준</em><b>현재고·입고예정·안전재고 기준</b></span> : criteria.source === 'PLAN' ? <label>식단표<select value={criteria.table_id} onChange={e => update({ table_id: e.target.value })}><option value="">기간 내 모든 식단표</option>{plans.map(plan => <option key={plan.table_id} value={plan.table_id}>{plan.table_name}</option>)}</select></label> : <><label>사용량 조회일수<input type="number" min="1" max="365" value={criteria.average_days} onChange={e => update({ average_days: Number(e.target.value) })} /></label><label>확보일수<input type="number" min="1" max="30" value={criteria.coverage_days} onChange={e => update({ coverage_days: Number(e.target.value) })} /></label></>}
        <label>조회 시작일<input type="date" value={criteria.date_from} onChange={e => update({ date_from: e.target.value })} /></label>
        <label>조회 종료일<input type="date" value={criteria.date_to} onChange={e => update({ date_to: e.target.value })} /></label>
        <label>납품일<input type="date" min={day()} max={criteria.source === 'PLAN' ? undefined : criteria.date_to} value={criteria.delivery_date} onChange={e => chooseDelivery(e.target.value)} /></label>
        <label>공급사 사업장<select className="workplace-select" value={criteria.sold_to ? (criteria.supplier_code || 'WELSTORY') + ':' + criteria.sold_to : ''} onChange={e => { const [supplier_code = '', sold_to = ''] = e.target.value.split(':'); update({ sold_to, supplier_code }) }}><option value="">전체 공급사·사업장</option>{sites.map(site => <option key={site.supplier_account_site_id} value={site.supplier_code + ':' + site.external_site_code}>{site.supplier_name} · {site.external_site_name} ({site.external_site_code})</option>)}</select></label>
        <button type="button" className="rd-btn is-primary" disabled={loading || previewing} onClick={() => setRevision(value => value + 1)}>{loading ? '조회 중…' : '다시 계산'}</button>
        <label className="shortage-order-check"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />60초마다 다시 계산</label>
        {/* 2026-11-25 사용자 요청: 조회 시작일·종료일이 무엇에 쓰이는지 먼저 알려 준다(서버 ShortageProcurementService·Mapper 기준) */}
        <p className="rd-order__period-help rd-fs-xs rd-muted">{criteria.source === 'PLAN' || criteria.source === 'DRAFT'
          ? <><b>조회 시작일~종료일</b> = 이 납품으로 쓸 식단 기간이에요. 이 기간 식단의 필요량을 더하고, 오늘~시작일 전 식단이 쓸 양은 재고에서 먼저 빼요. 납품일을 고르면 '납품 다음 날 ~ 다음 납품일'로 자동으로 바뀌어요.</>
          : <><b>조회 시작일</b> = 재고 기준일(소비기한이 이 날 전에 끝나는 재고는 없는 것으로 봐요). <b>조회 종료일</b> = 이 날까지 들어올 입고 예정 주문만 재고에 더해요. 납품일은 종료일 안이어야 하고, 기본은 시작일부터 일주일 — 납품일이 그보다 늦으면 종료일이 납품일로 늘었다가, 다시 앞 날짜를 고르면 일주일로 돌아가요.</>}</p>
      </section>
    </section> : null}

    {error ? <p className="rd-alert" role="alert">{error}</p> : null}
    {result?.missing_recipe_menus?.length ? <p className="rd-alert" role="status">1인분 식재료(레시피)가 없어 필요량 계산에서 뺀 메뉴: {result.missing_recipe_menus.map(m => m.menu_name || m.menu_id).join(', ')} · 식단표에서 메뉴를 눌러 식재료를 넣거나 '완제품'·'레시피 없는 메뉴'로 정해 주세요.</p> : null}

    <div className="rd-order__grid">
      <section className="rd-card rd-order__list" aria-label="시켜야 할 식재료">
        <div className="rd-order__list-head">
          <div>
            <h2 className="rd-h2">{dayLabel(criteria.delivery_date || day(1))}{criteria.source === 'PLAN' ? ` 납품 · ${dayLabel(criteria.date_from)}${criteria.date_to !== criteria.date_from ? `~${dayLabel(criteria.date_to)}` : ''}` : ''} {criteria.source === 'FAVORITE_MENU' ? '나만의 메뉴 식재료' : criteria.source === 'STOCK' ? '지금 부족한 식재료' : criteria.source === 'INVENTORY' ? '사용량 기준 부족 예상' : criteria.source === 'DRAFT' ? '구성 중인 식단에 모자란 식재료' : '식단에 모자란 식재료'} {allRows.length}개</h2>
            {/* 식단 기준(기본) 안내 문구는 뺌(2026-11-17 사용자 요청) */}
            {recommended ? <p className="rd-muted rd-fs-sm">추천 발주안 · 늘 쓰는 상품으로 바로 시킬 수 있는 품목을 미리 골라 뒀어요. 확인하고 발주하세요.</p> : null}
            {criteria.source === 'FAVORITE_MENU' || criteria.source === 'STOCK' || criteria.source === 'INVENTORY' ? <p className="rd-muted rd-fs-sm">{criteria.source === 'FAVORITE_MENU' ? '나만의 메뉴(♥)에 쓰이는 식재료예요. 필요한 수량을 직접 넣어 주문하세요.' : criteria.source === 'STOCK' ? '현재고가 없거나 안전재고보다 적어요. 사용 이력이 없으면 수량을 직접 정해 주세요.' : '최근 평균 사용량 × 확보일수 + 안전재고 기준이에요. 사용 확정 이력이 없으면 0으로 계산돼요.'}</p> : null}
            <span className="rd-order__tools-end">
              <select className="rd-input" aria-label="줄 순서" value={rowSort} onChange={e => setRowSort(e.target.value as RowSort)}>
                <option value="default">모자란 순</option><option value="amount_desc">금액 높은 순</option><option value="amount_asc">금액 낮은 순</option>
              </select>
              <input className="rd-input" aria-label="부족 식재료 검색" placeholder="식재료 찾기" value={keyword} onChange={e => setKeyword(e.target.value)} />
            </span>
          </div>
          {/* 도구 순서 = 자주 누르는 순: 모두 선택·해제 → 상태 거르기. 정렬·찾기는 제목 줄 오른쪽 */}
          <div className="rd-order__tools">
            <button type="button" className="rd-btn is-selected" disabled={loading} title="보이는 품목 중 납품·마감 조건이 확인된 상품을 모두 선택합니다. 수량 직접 입력 품목은 최소 발주수량으로 담기니 수량을 확인하세요." onClick={() => setSelected(current => ({ ...(stockFilter || keyword ? current : {}), ...availableSelection(rows) }))}>바로 시킬 수 있는 것 모두 선택</button>
            <button type="button" className="rd-btn is-ghost" disabled={!selectionCount} onClick={() => setSelected({})}>선택 해제</button>
            <div className="rd-pills" role="group" aria-label="재고 상태 필터">{([['', '전체'], ['RED', '모자람'], ['YELLOW', '안전재고 미달'], ['CHECK', '확인 필요']] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={stockFilter === value} className={stockFilter === value ? 'is-active' : ''} onClick={() => setStockFilter(value)}>{label} {stockCounts[value]}</button>)}</div>
          </div>
        </div>
        <div className="rd-order__split"><div className="rd-order__scroll"><div className="rd-order__table">
          <div className="rd-order__row is-head rd-fs-xs"><span /><span>식재료</span><span>재고 → 필요</span><span>선택상품 (100g당 가격)</span><span>주문 수량</span></div>
          {sortedRows.map(row => {
            const selection = selected[row.ingredient_id]
            const offer = offerOf(row)
            const status = shortageStockStatus(row)
            const qty = selection?.order_qty ?? offer?.recommended_qty ?? 0
            const total = Math.max(row.required_qty + row.safe_stock_qty, row.current_qty + row.incoming_qty, 1)
            const cheaper = offer ? cheapestOther(row, offer) : null
            const warning = offer ? deliveryWarning(offer, criteria.delivery_date, guidanceNow) : ''
            const step = offer?.order_increment_qty || 1
            const max = offer ? (offer.quantity_basis === 'MANUAL' ? MANUAL_MAX_ORDER_QTY : Math.max(offer.recommended_qty, offer.minimum_order_qty)) : 0
            const open = activeId === row.ingredient_id
            return <Fragment key={row.ingredient_id}><div className={`rd-order__row is-pickable${row.ingredient_id === focusIngredient ? ' is-focused' : ''}${!offer ? ' is-blocked' : ''}${open ? ' is-open' : ''}${offer ? ` is-by-${offer.supplier_code}` : ''}`}
              aria-expanded={open} title={open ? '누르면 상품 목록 접기' : '누르면 웰스토리·아워홈 상품 보기'}
              onClick={e => { if (!(e.target as HTMLElement).closest('input, button, a, select, label, .image-zoom-trigger')) setActiveId(current => current === row.ingredient_id ? '' : row.ingredient_id) }}>
              <input aria-label={`${row.ingredient_name} 선택`} type="checkbox" checked={Boolean(selection)} disabled={!offer || loading} onChange={e => { if (e.target.checked && offer) choose(row, offer.supplier_offer_id); else setSelected(current => { const next = { ...current }; delete next[row.ingredient_id]; return next }) }} />
              <div className="rd-order__name">
                <strong className="rd-fs-md">{row.ingredient_name}</strong>
                <span className="rd-order__tags">
                {row.quantity_basis === 'MANUAL' ? <span className="rd-chip is-urgent">현재고 없음 · 수량 직접 입력</span> : status !== 'GREEN' ? <span className={`rd-chip ${status === 'RED' ? 'is-urgent' : 'rd-tone-yellow'}`}>{status === 'RED' ? '모자람' : SHORTAGE_STOCK_LABELS[status]}</span> : null}
                {row.menu_names.filter(Boolean).length ? <span className="rd-order__menus">
                  <button type="button" className="rd-order__menus-btn rd-fs-xs" aria-expanded={menuTip === row.ingredient_id} aria-label={`${row.ingredient_name} 포함메뉴 보기`} title="포함메뉴 보기" onClick={() => setMenuTip(current => current === row.ingredient_id ? '' : row.ingredient_id)}><b aria-hidden="true">!</b></button>
                  {menuTip === row.ingredient_id ? <span className="rd-order__menus-tip rd-fs-xs" role="tooltip">{row.menu_names.filter(Boolean).join(', ')}</span> : null}
                </span> : null}
                </span>
                {row.issues.map(issue => <small className="rd-text-warn rd-fs-xs" key={issue}>{issue}</small>)}
                {(row.notices || []).map(notice => <small className="rd-muted rd-fs-xs" key={notice}>{notice}</small>)}
              </div>
              <div className="rd-order__stock">
                <span className="rd-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, row.current_qty / total * 100)}%` }} /><span className="is-incoming" style={{ width: `${Math.min(100, row.incoming_qty / total * 100)}%` }} /></span>
                <small className="rd-fs-xs" title={`재고 ${number(row.current_qty)}${row.base_unit}${row.incoming_qty ? ` + 입고예정 ${number(row.incoming_qty)}${row.base_unit}` : ''} · 필요 ${number(row.required_qty)}${row.base_unit}${row.safe_stock_qty ? ` (+안전재고 ${number(row.safe_stock_qty)}${row.base_unit})` : ''}${row.prior_usage_qty ? ` (+그 전 식단 사용 예정 ${number(row.prior_usage_qty)}${row.base_unit})` : ''}`}>{number(row.current_qty + row.incoming_qty)} → {number(row.required_qty + row.safe_stock_qty + Number(row.prior_usage_qty || 0))}{row.base_unit}</small>
                <strong className={`rd-fs-sm ${status === 'RED' ? 'rd-text-red' : 'rd-text-yellow'}`}>{number(row.shortage_qty)}{row.base_unit} 모자람</strong>
              </div>
              <div className="rd-order__offer">
                {offer ? <ProductImage zoomable src={offer.thumbnail_url || offer.image_url || undefined} fullSrc={offer.image_url || undefined} name={offer.product_name} /> : null}
                <div>
                  {offer ? <div className="rd-order__offer-name"><span className={`rd-supplier is-${offer.supplier_code}`}>{offer.supplier_name}</span>
                    <strong className="rd-order__offer-title" title={offer.product_name}>{offer.supplier_offer_id === row.recommended_offer_id ? '★ ' : ''}{offer.product_name}</strong>
                    <FavoriteProductHeart key={offer.supplier_product_id} accountId={accountId} supplierProductId={offer.supplier_product_id} productName={offer.product_name} favorite={offer.favorite_yn === 'Y'} /></div>
                    : <strong className="rd-text-warn">발주 가능한 상품 없음</strong>}
                  {offer ? <small className="rd-fs-sm">{money(offer.purchase_price)}원/{offer.order_unit}{per100(offer, row.base_unit) ? ` · ${per100(offer, row.base_unit)}` : ''} · {deliveryTerms(offer)}</small>
                    : <small className="rd-text-warn rd-fs-xs">{blockedReasons(row.offers.map(o => o.availability_reason)) || '주문 가능한 공급사 상품 없음 — 상품 검색에서 직접 골라주세요'}</small>}
                  {warning ? <small className="rd-text-warn rd-fs-xs" role="status">{warning}</small> : null}
                  {cheaper ? <button type="button" className="rd-link" onClick={() => choose(row, cheaper.offer.supplier_offer_id)}>{cheaper.offer.supplier_name} {cheaper.offer.product_name} {cheaper.label}으로 바꾸기</button>
                    : offer && row.offers.filter(o => o.orderable).length > 1 ? <small className="rd-text-ok rd-fs-xs">지금 상품이 기준단위당 가장 저렴해요</small> : null}
                  {offer && !selection ? <small className="rd-muted rd-fs-xs">추천 상품 · 체크하거나 줄을 눌러 아래 상품을 고르면 담겨요</small> : null}
                </div>
              </div>
              <div className="rd-order__qty">
                {offer ? <>
                  <span className="rd-stepper">
                    <button type="button" aria-label={`${row.ingredient_name} 수량 줄이기`} disabled={!selection || loading || qty - step < offer.minimum_order_qty} onClick={() => setQty(row, offer, Math.round((qty - step) * 1000) / 1000)}>−</button>
                    <input aria-label={`${row.ingredient_name} 발주수량`} type="number" min={offer.minimum_order_qty} step={step} max={max} disabled={!selection || loading} value={qty} onChange={e => setQty(row, offer, Number(e.target.value))} />
                    <button type="button" aria-label={`${row.ingredient_name} 수량 늘리기`} disabled={!selection || loading || qty + step > max} onClick={() => setQty(row, offer, Math.round((qty + step) * 1000) / 1000)}>+</button>
                  </span>
                  <small className="rd-muted rd-fs-xs">{offer.order_unit}(1={number(offer.package_base_qty)}{row.base_unit}) · {selection ? `${money(qty * offer.purchase_price)}원` : `권장 ${number(offer.recommended_qty)}`}</small>
                </> : <small className="rd-muted">—</small>}
              </div>
            </div>
            {open ? <div className="rd-order__expand" role="region" aria-label={`${row.ingredient_name} 공급사 상품`}>
              {supplierPanel(row, 'WELSTORY', '웰스토리')}
              {supplierPanel(row, 'OURHOME', '아워홈')}
            </div> : null}
            </Fragment>
          })}
          {!rows.length ? <div className="rd-order__empty">{loading ? '모자란 식재료를 계산하고 있어요.' : stockFilter && allRows.length ? '선택한 상태에 해당하는 식재료가 없어요.' : '이 기준으로 모자란 식재료가 없어요.'}</div> : null}
        </div></div>
        </div>
      </section>

      <aside className="rd-order__side" aria-label="발주서 미리보기">
        {/* 2026-11-23(사용자 시안): 전체 발주서 미리보기(품목·공급사 점·금액, 총계, 발주하기) 아래에 공급사별 미리보기 카드 */}
        <div className="rd-card rd-order__summary">
          <h2 className="rd-h2 rd-order__summary-title">발주서 미리보기</h2>
          <p className="rd-order__legend rd-fs-xs"><span className="is-WELSTORY">웰스토리</span><span className="is-OURHOME">아워홈</span></p>
          {picked.length ? <ul className="rd-order__picked">
            {picked.map(item => <li key={item.id}><span>{item.name}</span><i className={`rd-order__dot is-${item.offer.supplier_code}`} title={item.offer.supplier_name} /><b>{money(item.amount)}원</b></li>)}
          </ul> : <p className="rd-order__empty">식재료를 체크하거나 줄을 눌러 상품을 고르면 여기에 담겨요.</p>}
          <div className="rd-order__total"><span>총 계</span><strong>{loading ? '계산 중…' : `${money(selectedAmount)}원`}</strong></div>
          <button type="button" className="rd-btn is-primary rd-order__confirm" disabled={!selectionCount || loading || previewing} onClick={() => void makePreview()}>{previewing ? '서버 검증 중…' : selectionCount ? `발주하기 · ${selectionCount}품목` : '발주하기'}</button>
          {cart ? <button type="button" className="rd-btn rd-order__cart" disabled={loading || !result} onClick={restoreCart}>장바구니 불러오기 ({cart.items.length})</button> : null}
          {cartNotice && !preview ? <p className="rd-fs-xs rd-muted" role="status">{cartNotice}</p> : null}
          <div className="rd-order__side-actions">
            <button type="button" className="rd-btn is-ghost" disabled={submitting || previewing} onClick={() => { try { startNewMixedProcurement(accountId); setBatchResult(null); setCompleted(false); setSelected({}); setPreview(null); setRevision(value => value + 1); setError('') } catch (e) { setError(e instanceof Error ? e.message : '기존 발주 확인 필요') } }}>새 발주 작성</button>
            <button type="button" className="rd-btn is-ghost" disabled={submitting} onClick={() => { setSubmitting(true); void recoverMixedProcurement(accountId).then(setBatchResult).catch(e => setError(e.message)).finally(() => setSubmitting(false)) }}>이전 요청 결과 확인</button>
          </div>
          <BatchOrderResults result={preview ? null : batchResult} accountId={accountId} />
          {completed && !preview ? <Link className="rd-btn is-primary rd-order__confirm" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId })}`}>다음: 발주서·입고에서 확인 →</Link> : null}
        </div>
        {Object.entries(groups).map(([key, group]) => <section key={key} className={`rd-card rd-order__sheet is-${group.code}`} aria-label={`${group.name} 발주서 미리보기`}>
          <p className="rd-order__legend rd-fs-xs"><span className={`is-${group.code}`}>{group.name}</span></p>
          <h3 className="rd-order__summary-title">발주서 미리보기</h3>
          <span className="rd-fs-xs rd-muted rd-order__sheet-site">{group.site} · {dayLabel(criteria.delivery_date)} 납품</span>
          <ul className="rd-order__picked">{group.items.map(item => <li key={item.id}><span>{item.name}</span><i className={`rd-order__dot is-${group.code}`} /><b>{money(item.amount)}원</b></li>)}</ul>
          <div className="rd-order__total"><span>총 계</span><strong>{money(group.amount)}원</strong></div>
          <small className="rd-fs-xs rd-muted">{group.terms}</small>
        </section>)}
        {blocked.length ? <div className="rd-order__blocked rd-fs-sm"><strong className="rd-fs-md">바로 시킬 수 없는 식재료 {blocked.length}개</strong>{blocked.slice(0, 4).map(row => <span key={row.ingredient_id}>{row.ingredient_name} · {row.issues[0] || row.offers.map(o => o.availability_reason).find(Boolean) || '발주 가능한 상품 없음'}</span>)}</div> : null}
      </aside>
    </div>
    {preview ? createPortal(<div className="shortage-order-page shortage-order-overlay rd rd-preview-overlay"><section className="shortage-order-sheet rd-preview" role="dialog" aria-modal="true" aria-labelledby="shortage-sheet-title">
      {/* 2026-10-15 개편(시안 ⑥): 공급사별 발주서 카드 + 상태 칩 + 합계·보내기. 인쇄 규칙은 shortage-order-sheet/actions 클래스 그대로 */}
      {/* 2026-11-23 사용자 시안(태블릿 '최종 검토'와 같은 모양): 아워홈 · 전체 · 웰스토리 발주서 미리보기 3장 → 장바구니 · 발주하기. 상품·수량·단가 상세는 '자세히' */}
      <header className="rd-preview__head rd-review__head">
        <div><h2 id="shortage-sheet-title" className="rd-h1">최종 검토</h2>
          <span className="rd-muted rd-fs-sm">{dayLabel(preview.criteria.delivery_date)} 납품 · 발주서 {previewSheets.length}장(공급사·사업장별) · {preview.items.length}품목</span></div>
        <button type="button" className="rd-btn rd-icon-btn shortage-order-actions" aria-label="닫기" disabled={submitting} onClick={closePreview}>×</button>
      </header>
      <div className="rd-preview__body">
        <div className="rd-preview__chips">
          <span className="rd-chip is-ok">✓ 서버 검증 완료 {preview.items.length - previewWarnings}품목</span>
          {previewWarnings ? <span className="rd-chip is-warn">! 납품일·마감 확인 {previewWarnings}품목</span> : null}
          <span className="rd-chip is-done">과세 품목 세액은 공급사 정산 기준</span>
        </div>
        <div className="rd-review__cards">{reviewCard('OURHOME', '아워홈')}{reviewCard('', '전체')}{reviewCard('WELSTORY', '삼성웰스토리')}</div>
        <details className="rd-review__detail" open={showDetail} onToggle={e => setShowDetail((e.target as HTMLDetailsElement).open)}>
        <summary className="rd-fs-sm">자세히 보기 · 상품·수량·단가·사업장{previewWarnings ? ` · 납품일·마감 확인 ${previewWarnings}품목` : ''}</summary>
        {previewSheets.map(sheet => <article key={sheet.key} className={`rd-preview__sheet is-${sheet.code}`}>
          <div className="rd-preview__sheet-head"><span><span className={`rd-supplier is-${sheet.code}`}>{sheet.name}</span> <strong>{sheet.site}</strong></span><span className="rd-fs-xs rd-muted">{sheet.terms}</span></div>
          <div className="rd-preview__row is-head rd-fs-xs"><span>식재료 → 상품</span><span className="is-num">수량</span><span className="is-num">단가</span><span className="is-num">금액</span></div>
          {sheet.rows.map(row => { const warning = deliveryWarning(row.offer, preview.criteria.delivery_date, guidanceNow)
            return <div key={row.ingredient_id} className={`rd-preview__row${warning ? ' is-warn' : ''}`}>
              <div className="rd-preview__item"><ProductImage zoomable src={row.offer.thumbnail_url || row.offer.image_url || undefined} fullSrc={row.offer.image_url || undefined} name={row.offer.product_name} />
                <div><strong>{row.ingredient_name}</strong><small className="rd-muted">{row.offer.product_name} · {row.offer.supplier_item_code}<FavoriteProductHeart accountId={accountId} supplierProductId={row.offer.supplier_product_id} productName={row.offer.product_name} favorite={row.offer.favorite_yn === 'Y'} /></small>
                  <small className="rd-muted">부족 {number(row.shortage_qty)}{row.base_unit} → {number(row.ordered_base_qty)}{row.base_unit} 주문</small>
                  {warning ? <small className="rd-text-warn" role="status">{warning}</small> : null}</div></div>
              <span className="is-num">{number(row.order_qty)} {row.offer.order_unit}</span>
              <span className="is-num">{money(row.offer.purchase_price)}원</span>
              <span className="is-num"><b>{money(row.item_amount)}원</b>{row.supply_amount === null ? <small className="rd-muted">{taxLabel(row.tax_type)}</small> : null}</span>
            </div> })}
          <div className="rd-preview__subtotal"><span className="rd-muted">소계</span><b>{money(sheet.amount)}원</b></div>
        </article>)}
        </details>
        {cartNotice ? <p className="rd-fs-sm" role="status">{cartNotice}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <BatchOrderResults result={batchResult} accountId={accountId} />
      </div>
      <footer className="rd-preview__foot">
        <div><span className="rd-muted rd-fs-sm">상품금액 합계</span><strong className="shortage-order-total">{money(preview.item_amount)}원</strong></div>
        <div className="shortage-order-actions rd-preview__actions">
          <button type="button" className="rd-btn print-button" disabled={submitting} onClick={printPreview}><PrintIcon />미리보기 인쇄</button>
          <button type="button" className="rd-btn" disabled={submitting} onClick={closePreview}>돌아가서 고치기</button>
          {/* 업무 순서 ②→③: 보낸 뒤에는 같은 자리에서 발주서·입고로 */}
          {completed ? <Link className="rd-btn is-primary rd-preview__send" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId })}`}>다음: 발주서·입고에서 확인 →</Link>
            : <><button type="button" className="rd-btn rd-review__cart" disabled={submitting} onClick={putInCart}>장바구니</button>
              <button type="button" className="rd-btn is-primary rd-preview__send rd-review__order" disabled={submitting} onClick={() => void submit()}>{submitting ? '검증·발주 중…' : `발주하기 · 공급사 ${previewSheets.length}곳`}</button></>}
        </div>
      </footer>
    </section>{submitting ? <LoadingScreen overlay message={'공급사에 발주를 보내고 있습니다.\n창을 닫거나 새로고침하지 마세요.'} /> : null}</div>, document.body) : null}
  </div>
  if (embedded) return <div className="shortage-order-page procurement-refresh">{body}</div>
  return <div className="shortage-order-page procurement-refresh"><TopMenuLayout title="부족 식재료 발주">{body}</TopMenuLayout></div>
}
export default FoodOrder
