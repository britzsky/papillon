import CatalogPreparation from '../../components/CatalogPreparation'
import LoadingScreen from '../../components/LoadingScreen'
import BatchOrderResults from '../../components/BatchOrderResults'
import ProductImage from '../../components/ProductImage'
import { recoverMixedProcurement, startNewMixedProcurement } from '../../api/mixedProcurement'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { MANUAL_MAX_ORDER_QTY, shortageStockStatus, SHORTAGE_STOCK_LABELS, type ShortageOffer, type ShortageRow } from '../../api/shortageProcurement'
import { useEffect, useState } from 'react'
import { getDeadlineAlertsCached } from '../../api/deadlineAlerts'
import { availableSelection, day, deliveryTerms, deliveryWarning, money, number, taxLabel, useShortageOrder } from '../../features/order/useShortageOrder'
import { PrintIcon } from '../../components/ActionIcons'
import './ShortageFoodOrder.css'

/**
 * embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다.
 * fixedSource: 발주하기의 기준 탭(식단표·현재 부족 재고·최근 사용량)이 정한 계산 기준. 이때 화면 안의 기준 전환은 숨긴다.
 * 식단표 기준 탭은 식단 구성 화면에서 넘어온 '구성 중인 식단(DRAFT)'도 받는다.
 */
/** 기준단위 100g(또는 100ml·1개)당 가격. 같은 식재료의 공급사 상품끼리 비교할 때 쓴다. */
function unitCost(offer: ShortageOffer, unit: string) {
  const qty = Number(offer.package_base_qty) || 0
  if (!qty || !offer.purchase_price) return null
  const u = unit.toLowerCase()
  const factor = u === 'g' || u === 'ml' ? 100 : u === 'kg' || u === 'l' ? 0.1 : 1
  return { value: offer.purchase_price / qty * factor, per: u === 'g' || u === 'kg' ? '100g' : u === 'ml' || u === 'l' ? '100ml' : unit }
}
function per100(offer: ShortageOffer, unit: string) {
  const cost = unitCost(offer, unit)
  return cost ? `${cost.per}당 ${money(Math.round(cost.value))}원` : ''
}
type RowSort = 'default' | 'amount_desc' | 'amount_asc'
/** 상품 선택칸 순서: 늘 쓰는 상품(기본 상품) 맨 위 고정 → 나머지 기준단위당 싼 순 → 발주 불가는 뒤로 */
function offerOptions(row: ShortageRow) {
  return [...row.offers].sort((a, b) => {
    if (a.supplier_offer_id === row.recommended_offer_id) return -1
    if (b.supplier_offer_id === row.recommended_offer_id) return 1
    if (a.orderable !== b.orderable) return a.orderable ? -1 : 1
    const ca = unitCost(a, row.base_unit), cb = unitCost(b, row.base_unit)
    return ca && cb ? ca.value - cb.value : ca ? -1 : cb ? 1 : 0
  })
}
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

function FoodOrder({ embedded = false, fixedSource }: { embedded?: boolean; fixedSource?: 'PLAN' | 'STOCK' | 'INVENTORY' }) {
  const { accountId, focusIngredient, criteria, guidanceNow, plans, sites, result, selected, setSelected, keyword, setKeyword, stockFilter, setStockFilter, autoRefresh, setAutoRefresh, setRevision, loading, error, setError, message, batchResult, setBatchResult, preview, setPreview, previewing, submitting, setSubmitting, completed, setCompleted, update, stockCounts, rows, selectionCount, selectedAmount, makePreview, submit, closePreview } = useShortageOrder(fixedSource)
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
  const choose = (row: ShortageRow, id: number) => { const next = row.offers.find(o => o.supplier_offer_id === id && o.orderable); if (next && (next.orderability_status === 'AVAILABLE' || window.confirm(next.product_name + ' · ' + criteria.delivery_date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까? 확인한 경우에만 선택하세요.'))) setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: next.supplier_offer_id, order_qty: next.recommended_qty, delivery_terms_confirmed: next.orderability_status !== 'AVAILABLE' } })) }
  const setQty = (row: ShortageRow, offer: ShortageOffer, value: number) => setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, delivery_terms_confirmed: current[row.ingredient_id]?.delivery_terms_confirmed, order_qty: value } }))
  const groups = Object.values(selected).reduce<Record<string, { name: string; code: string; site: string; terms: string; names: string[]; amount: number }>>((acc, sel) => {
    const row = allRows.find(r => r.ingredient_id === sel.ingredient_id); const offer = row?.offers.find(o => o.supplier_offer_id === sel.supplier_offer_id)
    if (!row || !offer) return acc
    const key = offer.supplier_code + ':' + offer.external_site_code
    const group = acc[key] ||= { name: offer.supplier_name, code: offer.supplier_code, site: offer.external_site_name || offer.external_site_code, terms: deliveryTerms(offer), names: [], amount: 0 }
    group.names.push(row.ingredient_name); group.amount += (sel.order_qty || 0) * offer.purchase_price
    return acc
  }, {})
  const deliveryDays = Array.from(new Set([day(1), day(2), day(3), day(4), day(5), day(6), day(7), criteria.delivery_date].filter(Boolean))).sort().slice(0, 8)
  const dayLabel = (value: string) => { const d = new Date(`${value}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()} ${'일월화수목금토'[d.getDay()]}` }
  const dayHint = (value: string) => value === day() ? '오늘' : value === day(1) ? '내일' : value === day(2) ? '모레' : ''
  // 조회 조건(식단표·기간·사업장·자동 계산)은 자주 바꾸지 않아 접어 둔다. 납품일은 위 납품일 줄에서 고른다
  const [showFilters, setShowFilters] = useState(false)
  const pickDay = (value: string) => update(value > criteria.date_to ? { delivery_date: value, date_to: value } : { delivery_date: value })

  // 발주서 확인 창: 공급사·사업장별 발주서 묶음과 납품일·마감 경고 품목 수
  const previewSheets = Object.values((preview?.items || []).reduce<Record<string, { key: string; code: string; name: string; site: string; terms: string; amount: number; rows: NonNullable<typeof preview>['items'] }>>((acc, row) => {
    const key = row.offer.supplier_code + ':' + row.offer.external_site_code
    const sheet = acc[key] ||= { key, code: row.offer.supplier_code, name: row.offer.supplier_name, site: row.offer.external_site_name || row.offer.external_site_code, terms: deliveryTerms(row.offer), amount: 0, rows: [] }
    sheet.rows.push(row); sheet.amount += Number(row.item_amount) || 0
    return acc
  }, {}))
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
        <span className="rd-order__prep rd-fs-sm"><b>상품 준비</b> <CatalogPreparation inline key={accountId + criteria.delivery_date} accountId={accountId} date={criteria.delivery_date} onReady={() => setRevision(n => n + 1)} /></span>
        <button type="button" className={`rd-btn${showFilters ? ' is-selected' : ''}`} aria-expanded={showFilters} aria-controls="order-filters" onClick={() => setShowFilters(value => !value)}>조회 조건 {showFilters ? '접기' : '보기'}</button>
      </div>
    </div>
    {criteria.delivery_date === guidanceNow.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) ? <p className="rd-text-warn rd-fs-sm rd-order__today" role="status">당일 납품 선택 · D-1 이상 품목은 납품일자 변경 요망</p> : null}

    {showFilters ? <section id="order-filters" className="rd-card rd-order__filters" aria-label="조회 조건">
      <section className="shortage-order-filters" aria-label="부족재고 조회 기준">
        {criteria.source === 'DRAFT' ? <span className="shortage-order-basis"><em>조회 기준</em><b>저장 전 식단의 메뉴·식수 기준</b></span> : criteria.source === 'STOCK' ? <span className="shortage-order-basis"><em>조회 기준</em><b>현재고·입고예정·안전재고 기준</b></span> : criteria.source === 'PLAN' ? <label>식단표<select value={criteria.table_id} onChange={e => update({ table_id: e.target.value })}><option value="">기간 내 모든 식단표</option>{plans.map(plan => <option key={plan.table_id} value={plan.table_id}>{plan.table_name}</option>)}</select></label> : <><label>사용량 조회일수<input type="number" min="1" max="365" value={criteria.average_days} onChange={e => update({ average_days: Number(e.target.value) })} /></label><label>확보일수<input type="number" min="1" max="30" value={criteria.coverage_days} onChange={e => update({ coverage_days: Number(e.target.value) })} /></label></>}
        <label>조회 시작일<input type="date" value={criteria.date_from} onChange={e => update({ date_from: e.target.value })} /></label>
        <label>조회 종료일<input type="date" value={criteria.date_to} onChange={e => update({ date_to: e.target.value })} /></label>
        <label>납품일<input type="date" min={day()} max={criteria.date_to} value={criteria.delivery_date} onChange={e => update({ delivery_date: e.target.value })} /></label>
        <label>공급사 사업장<select className="workplace-select" value={criteria.sold_to ? (criteria.supplier_code || 'WELSTORY') + ':' + criteria.sold_to : ''} onChange={e => { const [supplier_code = '', sold_to = ''] = e.target.value.split(':'); update({ sold_to, supplier_code }) }}><option value="">전체 공급사·사업장</option>{sites.map(site => <option key={site.supplier_account_site_id} value={site.supplier_code + ':' + site.external_site_code}>{site.supplier_name} · {site.external_site_name} ({site.external_site_code})</option>)}</select></label>
        <button type="button" className="rd-btn is-primary" disabled={loading || previewing} onClick={() => setRevision(value => value + 1)}>{loading ? '조회 중…' : '다시 계산'}</button>
        <label className="shortage-order-check"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />60초마다 다시 계산</label>
      </section>
    </section> : null}

    {error ? <p className="rd-alert" role="alert">{error}</p> : null}

    <div className="rd-order__grid">
      <section className="rd-card rd-order__list" aria-label="시켜야 할 식재료">
        <div className="rd-order__list-head">
          <div>
            <h2 className="rd-h2">{dayLabel(criteria.delivery_date || day(1))} {criteria.source === 'STOCK' ? '지금 부족한 식재료' : criteria.source === 'INVENTORY' ? '사용량 기준 부족 예상' : criteria.source === 'DRAFT' ? '구성 중인 식단에 모자란 식재료' : '식단에 모자란 식재료'} {allRows.length}개</h2>
            <p className="rd-muted rd-fs-sm">{criteria.source === 'STOCK' ? '현재고가 없거나 안전재고보다 적어요. 사용 이력이 없으면 수량을 직접 정해 주세요.' : criteria.source === 'INVENTORY' ? '최근 평균 사용량 × 확보일수 + 안전재고 기준이에요. 사용 확정 이력이 없으면 0으로 계산돼요.' : '필요량에서 지금 재고와 들어올 예정 수량을 빼고 계산했어요. 수량만 고치면 됩니다.'}</p>
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
        <div className="rd-order__scroll"><div className="rd-order__table">
          <div className="rd-order__row is-head rd-fs-xs"><span /><span>식재료</span><span>재고 → 필요</span><span>시킬 상품 (100g당 가격)</span><span>주문 수량</span></div>
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
            return <div key={row.ingredient_id} className={`rd-order__row${row.ingredient_id === focusIngredient ? ' is-focused' : ''}${!offer ? ' is-blocked' : ''}`}>
              <input aria-label={`${row.ingredient_name} 선택`} type="checkbox" checked={Boolean(selection)} disabled={!offer || loading} onChange={e => { if (e.target.checked && offer) choose(row, offer.supplier_offer_id); else setSelected(current => { const next = { ...current }; delete next[row.ingredient_id]; return next }) }} />
              <div className="rd-order__name">
                <strong className="rd-fs-md">{row.ingredient_name}</strong>
                {row.quantity_basis === 'MANUAL' ? <span className="rd-chip is-urgent">현재고 없음 · 수량 직접 입력</span> : status !== 'GREEN' ? <span className={`rd-chip ${status === 'RED' ? 'is-urgent' : 'rd-tone-yellow'}`}>{status === 'RED' ? '모자람' : SHORTAGE_STOCK_LABELS[status]}</span> : null}
                {row.menu_names.filter(Boolean).length ? <small className="rd-muted rd-fs-xs">{row.menu_names.filter(Boolean).join(', ')}</small> : null}
                {row.issues.map(issue => <small className="rd-text-warn rd-fs-xs" key={issue}>{issue}</small>)}
              </div>
              <div className="rd-order__stock">
                <span className="rd-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, row.current_qty / total * 100)}%` }} /><span className="is-incoming" style={{ width: `${Math.min(100, row.incoming_qty / total * 100)}%` }} /></span>
                <small className="rd-fs-xs">재고 {number(row.current_qty)}{row.base_unit}{row.incoming_qty ? ` + 입고예정 ${number(row.incoming_qty)}${row.base_unit}` : ''} · 필요 {number(row.required_qty)}{row.base_unit}{row.safe_stock_qty ? ` (+안전 ${number(row.safe_stock_qty)})` : ''}</small>
                <strong className={`rd-fs-sm ${status === 'RED' ? 'rd-text-red' : 'rd-text-yellow'}`}>{number(row.shortage_qty)}{row.base_unit} 모자람</strong>
              </div>
              <div className="rd-order__offer">
                {offer ? <ProductImage zoomable src={offer.thumbnail_url || offer.image_url || undefined} fullSrc={offer.image_url || undefined} name={offer.product_name} /> : null}
                <div>
                  {offer ? <div className="rd-order__offer-name"><span className={`rd-supplier is-${offer.supplier_code}`}>{offer.supplier_name}</span>
                    <select aria-label={`${row.ingredient_name} 공급상품`} value={offer.supplier_offer_id} disabled={loading || row.offers.filter(o => o.orderable).length < 2} onChange={e => choose(row, Number(e.target.value))}>
                      {offerOptions(row).map(o => <option key={o.supplier_offer_id} value={o.supplier_offer_id} disabled={!o.orderable}>{o.supplier_offer_id === row.recommended_offer_id ? '★ 늘 쓰는 · ' : ''}{o.product_name} ({o.supplier_name}) · {o.orderable ? `${money(o.purchase_price)}원/${o.order_unit}${per100(o, row.base_unit) ? ` · ${per100(o, row.base_unit)}` : ''}` : o.availability_reason || '발주 불가'}</option>)}
                    </select></div>
                    : <strong className="rd-text-warn">발주 가능한 상품 없음</strong>}
                  {offer ? <small className="rd-fs-sm">{money(offer.purchase_price)}원/{offer.order_unit}{per100(offer, row.base_unit) ? ` · ${per100(offer, row.base_unit)}` : ''} · {deliveryTerms(offer)}</small>
                    : <small className="rd-text-warn rd-fs-xs">{row.offers.map(o => o.availability_reason).filter(Boolean).join(' / ') || '공급상품 연결 확인 요망'}</small>}
                  {warning ? <small className="rd-text-warn rd-fs-xs" role="status">{warning}</small> : null}
                  {cheaper ? <button type="button" className="rd-link" onClick={() => choose(row, cheaper.offer.supplier_offer_id)}>{cheaper.offer.supplier_name} {cheaper.offer.product_name} {cheaper.label}으로 바꾸기</button>
                    : offer && row.offers.filter(o => o.orderable).length > 1 ? <small className="rd-text-ok rd-fs-xs">지금 상품이 기준단위당 가장 저렴해요</small> : null}
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
          })}
          {!rows.length ? <div className="rd-order__empty">{loading ? '모자란 식재료를 계산하고 있어요.' : stockFilter && allRows.length ? '선택한 상태에 해당하는 식재료가 없어요.' : '이 기준으로 모자란 식재료가 없어요.'}</div> : null}
        </div></div>
        <div className="rd-order__foot rd-muted rd-fs-xs">계산 시각 {result?.checked_at.replace('T', ' ').slice(0, 19) || '—'}{result?.unconfigured_count ? ` · 필요량 기준 없는 품목 ${result.unconfigured_count}건` : ''} · 부족량 = 필요량 + 안전재고 − 현재고 − 기발주 미입고(같은 식재료는 합산, 현재고는 한 번만 차감) · <Link to={`/order_manager/order?${new URLSearchParams({ tab: 'products', account_id: accountId })}`}>새 상품·미연결 식자재 발주</Link></div>
      </section>

      <aside className="rd-order__side" aria-label="발주서 미리보기">
        <div className="rd-card rd-order__summary">
          <h2 className="rd-h2">{Object.keys(groups).length ? `발주서 ${Object.keys(groups).length}장으로 나눠 보내요` : '발주서 미리보기'}</h2>
          <p className="rd-muted rd-fs-sm">공급사·사업장·납품일마다 따로 접수되고 마감도 따로예요.</p>
          {Object.entries(groups).map(([key, group]) => <div key={key} className={`rd-order__sheet is-${group.code}`}>
            <div className="rd-order__sheet-top"><span className={`rd-supplier is-${group.code}`}>{group.name} · {group.site}</span><span className="rd-fs-xs rd-muted">{group.terms}</span></div>
            <div className="rd-fs-md">{dayLabel(criteria.delivery_date)} 납품 · {group.names.slice(0, 3).join(', ')}{group.names.length > 3 ? ` 외 ${group.names.length - 3}` : ''}</div>
            <div className="rd-order__sheet-sum"><span className="rd-muted">{group.names.length}품목</span><strong>{money(group.amount)}원</strong></div>
          </div>)}
          {!Object.keys(groups).length ? <p className="rd-order__empty">왼쪽에서 식재료를 고르면 여기에 공급사별로 정리돼요.</p> : null}
          <div className="rd-order__total"><span className="rd-muted">상품금액 합계</span><strong>{loading ? '계산 중…' : `${money(selectedAmount)}원`}</strong></div>
          <button type="button" className="rd-btn is-primary rd-order__confirm" disabled={!selectionCount || loading || previewing} onClick={() => void makePreview()}>{previewing ? '서버 검증 중…' : `${selectionCount}품목 발주서 확인`}</button>
          <p className="rd-muted rd-fs-xs" style={{ textAlign: 'center' }}>확인 단계에서 공급사 가격·발주 가능 여부를 다시 검증해요</p>
          <div className="rd-order__side-actions">
            <button type="button" className="rd-btn is-ghost" disabled={submitting || previewing} onClick={() => { try { startNewMixedProcurement(accountId); setBatchResult(null); setCompleted(false); setSelected({}); setPreview(null); setRevision(value => value + 1); setError('') } catch (e) { setError(e instanceof Error ? e.message : '기존 발주 확인 필요') } }}>새 발주 작성</button>
            <button type="button" className="rd-btn is-ghost" disabled={submitting} onClick={() => { setSubmitting(true); void recoverMixedProcurement(accountId).then(setBatchResult).catch(e => setError(e.message)).finally(() => setSubmitting(false)) }}>이전 요청 결과 확인</button>
          </div>
          <BatchOrderResults result={preview ? null : batchResult} accountId={accountId} />
          {completed && !preview ? <Link className="rd-btn is-primary rd-order__confirm" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId })}`}>다음: 발주서·입고에서 확인 →</Link> : null}
        </div>
        {blocked.length ? <div className="rd-order__blocked rd-fs-sm"><strong className="rd-fs-md">바로 시킬 수 없는 식재료 {blocked.length}개</strong>{blocked.slice(0, 4).map(row => <span key={row.ingredient_id}>{row.ingredient_name} · {row.issues[0] || row.offers.map(o => o.availability_reason).find(Boolean) || '발주 가능한 상품 없음'}</span>)}</div> : null}
      </aside>
    </div>
    {preview ? createPortal(<div className="shortage-order-page shortage-order-overlay rd rd-preview-overlay"><section className="shortage-order-sheet rd-preview" role="dialog" aria-modal="true" aria-labelledby="shortage-sheet-title">
      {/* 2026-10-15 개편(시안 ⑥): 공급사별 발주서 카드 + 상태 칩 + 합계·보내기. 인쇄 규칙은 shortage-order-sheet/actions 클래스 그대로 */}
      <header className="rd-preview__head">
        <div><span className="rd-muted rd-fs-sm">보내기 전 마지막 확인</span>
          <h2 id="shortage-sheet-title" className="rd-h1">{dayLabel(preview.criteria.delivery_date)} 납품 · 발주서 {previewSheets.length}장 · {preview.items.length}품목</h2></div>
        <button type="button" className="rd-btn rd-icon-btn shortage-order-actions" aria-label="닫기" disabled={submitting} onClick={closePreview}>×</button>
      </header>
      <div className="rd-preview__body">
        <div className="rd-preview__chips">
          <span className="rd-chip is-ok">✓ 서버 검증 완료 {preview.items.length - previewWarnings}품목</span>
          {previewWarnings ? <span className="rd-chip is-warn">! 납품일·마감 확인 {previewWarnings}품목</span> : null}
          <span className="rd-chip is-done">과세 품목 세액은 공급사 정산 기준</span>
        </div>
        {previewSheets.map(sheet => <article key={sheet.key} className={`rd-preview__sheet is-${sheet.code}`}>
          <div className="rd-preview__sheet-head"><span><span className={`rd-supplier is-${sheet.code}`}>{sheet.name}</span> <strong>{sheet.site}</strong></span><span className="rd-fs-xs rd-muted">{sheet.terms}</span></div>
          <div className="rd-preview__row is-head rd-fs-xs"><span>식재료 → 상품</span><span className="is-num">수량</span><span className="is-num">단가</span><span className="is-num">금액</span></div>
          {sheet.rows.map(row => { const warning = deliveryWarning(row.offer, preview.criteria.delivery_date, guidanceNow)
            return <div key={row.ingredient_id} className={`rd-preview__row${warning ? ' is-warn' : ''}`}>
              <div className="rd-preview__item"><ProductImage zoomable src={row.offer.thumbnail_url || row.offer.image_url || undefined} fullSrc={row.offer.image_url || undefined} name={row.offer.product_name} />
                <div><strong>{row.ingredient_name}</strong><small className="rd-muted">{row.offer.product_name} · {row.offer.supplier_item_code}</small>
                  <small className="rd-muted">부족 {number(row.shortage_qty)}{row.base_unit} → {number(row.ordered_base_qty)}{row.base_unit} 주문</small>
                  {warning ? <small className="rd-text-warn" role="status">{warning}</small> : null}</div></div>
              <span className="is-num">{number(row.order_qty)} {row.offer.order_unit}</span>
              <span className="is-num">{money(row.offer.purchase_price)}원</span>
              <span className="is-num"><b>{money(row.item_amount)}원</b>{row.supply_amount === null ? <small className="rd-muted">{taxLabel(row.tax_type)}</small> : null}</span>
            </div> })}
          <div className="rd-preview__subtotal"><span className="rd-muted">소계</span><b>{money(sheet.amount)}원</b></div>
        </article>)}
        <p className="rd-muted rd-fs-xs">주문 직전에 판매상태·실시간 가격·최소수량·발주배수와 최신 부족량을 다시 검증해요. 평일·주말 마감이 다를 수 있고 사업장 배송일과 공급사 공지가 우선이에요. 입고가 확정될 때 재고에 반영돼요.</p>
        {message ? <p role="status">{message}</p> : null}
        <BatchOrderResults result={batchResult} accountId={accountId} />
      </div>
      <footer className="rd-preview__foot">
        <div><span className="rd-muted rd-fs-sm">상품금액 합계</span><strong className="shortage-order-total">{money(preview.item_amount)}원</strong></div>
        <div className="shortage-order-actions rd-preview__actions">
          <button type="button" className="rd-btn print-button" disabled={submitting} onClick={() => window.print()}><PrintIcon />미리보기 인쇄</button>
          <button type="button" className="rd-btn" disabled={submitting} onClick={closePreview}>돌아가서 고치기</button>
          {/* 업무 순서 ②→③: 보낸 뒤에는 같은 자리에서 발주서·입고로 */}
          {completed ? <Link className="rd-btn is-primary rd-preview__send" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId })}`}>다음: 발주서·입고에서 확인 →</Link>
            : <button type="button" className="rd-btn is-primary rd-preview__send" disabled={submitting} onClick={() => void submit()}>{submitting ? '검증·발주 중…' : `공급사 ${previewSheets.length}곳에 발주 보내기`}</button>}
        </div>
      </footer>
    </section>{submitting ? <LoadingScreen overlay message={'공급사에 발주를 보내고 있습니다.\n창을 닫거나 새로고침하지 마세요.'} /> : null}</div>, document.body) : null}
  </div>
  if (embedded) return <div className="shortage-order-page procurement-refresh">{body}</div>
  return <div className="shortage-order-page procurement-refresh"><SideMenuLayout header={<HeaderBar title="부족 식재료 발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주관리', to: '/order_manager' }, { label: '부족 식재료 발주' }]} />}>{body}</SideMenuLayout></div>
}
export default FoodOrder
