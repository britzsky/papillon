import CatalogPreparation from '../../components/CatalogPreparation'
import LoadingScreen from '../../components/LoadingScreen'
import BatchOrderResults from '../../components/BatchOrderResults'
import { clearDeadlineAlertCache } from '../../api/deadlineAlerts'
import { submitMixedProcurement, recoverMixedProcurement, startNewMixedProcurement, type BatchResult } from '../../api/mixedProcurement'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getTableMealsList, type TableMealsItem } from '../../api/operations'
import { getSupplierSites, type SupplierSite } from '../../api/supplierIntegration'
import { getPlanDates, getShortages, MANUAL_MAX_ORDER_QTY, matchesStockFilter, previewShortageOrder, shortageStockStatus, SHORTAGE_STOCK_LABELS, type OrderPreview, type OrderSelection, type ShortageCriteria, type ShortageResult, type ShortageOffer, type ShortageStockFilter } from '../../api/shortageProcurement'
import { PrintIcon } from '../../components/ActionIcons'
import './ShortageFoodOrder.css'

const day = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toLocaleDateString('sv-SE') }
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const money = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
const taxLabel = (value: string) => value === 'No tax' ? '면세' : ['Full tax', 'CONS', 'CONS(소모품)'].includes(value) ? '과세 · 세액 확인 필요' : '과세정보 확인 필요'

const statusRank = { RED: 0, YELLOW: 1, GREEN: 2 } as const

function deliveryTerms(offer: ShortageOffer) {
  const state = offer.orderability_status === 'AVAILABLE' ? '발주 가능' : offer.orderability_status === 'UNAVAILABLE' ? '발주 불가' : '확인 필요'
  return state + ' · ' + (offer.orderability_reason || '납품·마감 조건 확인 필요')
}

function deliveryWarning(offer: ShortageOffer, deliveryDate: string, now: Date) {
  const lead = Number(offer.lead_time_days)
  if (offer.lead_time_days == null || !Number.isInteger(lead) || lead < 0 || !deliveryDate) return ''
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const earliest = new Date(today + 'T00:00:00Z')
  earliest.setUTCDate(earliest.getUTCDate() + lead)
  if (deliveryDate < earliest.toISOString().slice(0, 10)) return '선택한 납품일은 리드타임 ' + lead + '일보다 빠릅니다. 납품일을 변경해주세요.'
  return ''
}

/**
 * embedded: 발주하기(OrderWorkspace) 탭 안에서 레이아웃 없이 내용만 그린다.
 * fixedSource: 발주하기의 기준 탭(식단표·현재 부족 재고·최근 사용량)이 정한 계산 기준. 이때 화면 안의 기준 전환은 숨긴다.
 * 식단표 기준 탭은 식단 구성 화면에서 넘어온 '구성 중인 식단(DRAFT)'도 받는다.
 */
function FoodOrder({ embedded = false, fixedSource }: { embedded?: boolean; fixedSource?: 'PLAN' | 'STOCK' | 'INVENTORY' }) {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const focusIngredient = params.get('ingredient_id') || ''
  const [criteria, setCriteria] = useState<ShortageCriteria>(() => {
    const resumeKey = !params.get('source') && !params.get('table_id') && !params.get('ingredient_id') && sessionStorage.getItem(`plan-editor:${accountId}`) ? `plan-procurement:${accountId}` : ''
    const draftKey = !fixedSource || fixedSource === 'PLAN' ? params.get('draft_key') || (resumeKey && sessionStorage.getItem(resumeKey) ? resumeKey : '') : ''
    if (draftKey) {
      try {
        const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null') as ShortageCriteria | null
        if (draft?.account_id === accountId && draft.source === 'DRAFT') return draft
      } catch { /* The API will explain that the draft must be reopened. */ }
      return { account_id: accountId, source: 'DRAFT', draft_meals: [], table_id: '', date_from: day(), date_to: day(6), delivery_date: day(), sold_to: '', average_days: 30, coverage_days: 1 }
    }
    // 마감 알림의 '발주하기'는 해당 납품일(delivery_date)로 연다. 조회 기간은 납품일까지 포함하도록 늘린다.
    const requestedDelivery = /^\d{4}-\d{2}-\d{2}$/.test(params.get('delivery_date') || '') && (params.get('delivery_date') as string) >= day() ? params.get('delivery_date') as string : ''
    return ({
    account_id: accountId, source: fixedSource ?? (params.get('source') === 'PLAN' || (!params.get('source') && params.get('table_id')) ? 'PLAN' : params.get('source') === 'STOCK' ? 'STOCK' : 'INVENTORY'),
    table_id: params.get('table_id') || '', date_from: day(), date_to: requestedDelivery > day(6) ? requestedDelivery : day(6), delivery_date: requestedDelivery || day(1),
    sold_to: '', average_days: 30, coverage_days: 1,
  })})
  const [guidanceNow, setGuidanceNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setGuidanceNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const [plans, setPlans] = useState<TableMealsItem[]>([])
  const [sites, setSites] = useState<SupplierSite[]>([])
  const [result, setResult] = useState<ShortageResult | null>(null)
  const [selected, setSelected] = useState<Record<string, OrderSelection>>({})
  const [keyword, setKeyword] = useState('')
  // 재고 상태 필터: ?stock=RED|YELLOW|CHECK 로 바로 열 수 있다
  const [stockFilter, setStockFilter] = useState<ShortageStockFilter>(() => {
    const value = params.get('stock')?.toUpperCase()
    return value === 'RED' || value === 'YELLOW' || value === 'CHECK' ? value : ''
  })
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    let active = true
    setSelected({}); setResult(null)
    setCriteria(current => ({ ...current, account_id: accountId, sold_to: '' }))
    if (!accountId) { setError('로그인한 거래처 정보를 확인해주세요.'); return }
    void Promise.all([getTableMealsList(accountId), getSupplierSites(accountId)]).then(([tables, rows]) => {
      if (!active) return
      const unique = rows.filter(site => ['WELSTORY', 'OURHOME'].includes(site.supplier_code))
      setPlans(tables); setSites(unique)
      setCriteria(current => ({ ...current, sold_to: '', supplier_code: '' }))
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : '거래처 조회 실패') })
    return () => { active = false }
  }, [accountId])

  useEffect(() => {
    if (!criteria.table_id || criteria.source !== 'PLAN') return
    let active = true
    void getPlanDates(accountId, criteria.table_id).then(dates => {
      if (!active || !dates.length) return
      setCriteria(current => ({ ...current, date_from: dates[0], date_to: dates[dates.length - 1], delivery_date: dates[0] < day() ? day() : dates[0] }))
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : '식단 기간 조회 실패') })
    return () => { active = false }
  }, [accountId, criteria.table_id, criteria.source])

  useEffect(() => {
    if (!criteria.account_id) return
    const controller = new AbortController()
    setLoading(true); setError(''); setPreview(null)
    void getShortages(criteria, controller.signal).then(data => {
      if (controller.signal.aborted) return
      setResult(data)
      setSelected(current => Object.fromEntries(Object.entries(current).filter(([id, selection]) => {
        const offer = data.ingredients.find(row => row.ingredient_id === id)?.offers.find(candidate => candidate.supplier_offer_id === selection.supplier_offer_id)
        return offer?.orderable && selection.order_qty > 0 && selection.order_qty <= (offer.quantity_basis === 'MANUAL' ? MANUAL_MAX_ORDER_QTY : offer.recommended_qty)
      })))
    }).catch((e: unknown) => {
      if (!controller.signal.aborted) { setResult(null); setSelected({}); setError(e instanceof Error ? e.message : '부족재고 조회 실패') }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [criteria, revision])

  useEffect(() => {
    if (!autoRefresh || preview || submitting || previewing) return
    const timer = window.setInterval(() => setRevision(value => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, preview, submitting, previewing])

  const update = (patch: Partial<ShortageCriteria>) => {
    setSelected({}); setPreview(null); setMessage(''); setCriteria(current => ({ ...current, ...patch }))
  }
  const stockCounts = useMemo(() => {
    const all = result?.ingredients || []
    return { '': all.length, RED: all.filter(row => matchesStockFilter(row, 'RED')).length,
      YELLOW: all.filter(row => matchesStockFilter(row, 'YELLOW')).length, CHECK: all.filter(row => matchesStockFilter(row, 'CHECK')).length }
  }, [result])
  // 빨강(필요량 부족) → 노랑(안전재고 미달) → 이름순. 집중 식재료는 맨 위.
  const rows = useMemo(() => [...(result?.ingredients || [])].filter(row =>
    matchesStockFilter(row, stockFilter) && (!keyword || `${row.ingredient_name} ${row.ingredient_id}`.toLowerCase().includes(keyword.toLowerCase())),
  ).sort((a, b) => Number(b.ingredient_id === focusIngredient) - Number(a.ingredient_id === focusIngredient)
    || statusRank[shortageStockStatus(a)] - statusRank[shortageStockStatus(b)] || a.ingredient_name.localeCompare(b.ingredient_name, 'ko')), [result, keyword, focusIngredient, stockFilter])
  const selectionCount = Object.keys(selected).length
  const selectedAmount = Object.values(selected).reduce((sum, selection) => {
    const offer = result?.ingredients.find(row => row.ingredient_id === selection.ingredient_id)?.offers.find(item => item.supplier_offer_id === selection.supplier_offer_id)
    return sum + (offer ? offer.purchase_price * selection.order_qty : 0)
  }, 0)
  const selectedSuppliers = [...new Set(Object.values(selected).flatMap(selection => {
    const offer = result?.ingredients.find(row => row.ingredient_id === selection.ingredient_id)?.offers.find(item => item.supplier_offer_id === selection.supplier_offer_id)
    return offer ? [offer.supplier_name] : []
  }))]
  const makePreview = async () => {
    setPreviewing(true); setError(''); setMessage(''); setCompleted(false); setBatchResult(null)
    try { setPreview(await previewShortageOrder(criteria, Object.values(selected))) }
    catch (e) { setError(e instanceof Error ? e.message : '발주서 확인 실패'); setRevision(value => value + 1) }
    finally { setPreviewing(false) }
  }
  const submit = async () => {
    if (!preview || submitting || completed) return
    setSubmitting(true); setMessage('')
    try {
      const response = await submitMixedProcurement({
        account_id: accountId, shortage_criteria: preview.criteria,
        items: preview.items.map(row => ({ source_ingredient_id: row.ingredient_id, supplier_offer_id: row.offer.supplier_offer_id,
          delivery_terms_confirmed: row.delivery_terms_confirmed, delivery_date: preview.criteria.delivery_date, order_qty: row.order_qty, expected_price: row.offer.purchase_price })),
      })
      setBatchResult(response); setCompleted(true); setSelected({}); clearDeadlineAlertCache()
      setMessage('공급사별 발주 결과를 확인해주세요.')
    } catch (e) { setMessage(e instanceof Error ? e.message : '발주 결과를 확인하지 못했습니다.') }
    finally { setSubmitting(false) }
  }
  const closePreview = () => { if (submitting) return; setPreview(null); setRevision(value => value + 1) }

  const body = <>
    {!fixedSource && <><div className="shortage-source-tabs" role="group" aria-label="발주 기준">
      {([['PLAN', '식단표 기준 부족량', '저장된 식단의 필요량으로 계산'], ['STOCK', '현재 부족 재고 바로 주문', '현재고가 없거나 안전재고보다 적은 식자재'], ['INVENTORY', '최근 사용량 기준 부족 예상', '최근 평균 사용량 × 확보일수 + 안전재고']] as const).map(([value, label, hint]) =>
        <button key={value} type="button" aria-pressed={criteria.source === value} className={criteria.source === value ? 'is-active' : ''} title={hint}
          onClick={() => update({ source: value, table_id: '' })}>{label}</button>)}
    </div>
    <p className="shortage-source-hint">{criteria.source === 'PLAN' ? '저장된 식단의 필요량으로 계산합니다.' : criteria.source === 'STOCK' ? '현재고가 없거나 안전재고보다 적은 식자재를 바로 주문합니다.' : criteria.source === 'INVENTORY' ? '최근 평균 사용량 × 확보일수 + 안전재고로 앞으로 부족할 식자재를 찾습니다.' : '구성 중인 식단의 메뉴·식수로 계산합니다.'}</p></>}
    <div className="shortage-compact-bar">
    {/* 조회 조건은 항상 펼쳐 둔다(사용자 요청) */}
    <div className="shortage-order-options">
    <section className="shortage-order-filters" aria-label="부족재고 조회 기준">
      {!fixedSource && <label>조회 기준<select value={criteria.source} onChange={e => update({ source: e.target.value as ShortageCriteria['source'], table_id: '' })}>{criteria.source === 'DRAFT' ? <option value="DRAFT">구성 중인 식단 필요량</option> : null}<option value="PLAN">식단표 기준 부족량</option><option value="STOCK">현재 부족 재고 바로 주문</option><option value="INVENTORY">최근 사용량 기준 부족 예상</option></select></label>}
      {criteria.source === 'DRAFT' ? <span className="shortage-order-basis"><em>조회 기준</em><b>저장 전 식단의 메뉴·식수 기준</b></span> : criteria.source === 'STOCK' ? <span className="shortage-order-basis"><em>조회 기준</em><b>현재고·입고예정·안전재고 기준</b></span> : criteria.source === 'PLAN' ? <label>식단표<select value={criteria.table_id} onChange={e => update({ table_id: e.target.value })}><option value="">기간 내 모든 식단표</option>{plans.map(plan => <option key={plan.table_id} value={plan.table_id}>{plan.table_name}</option>)}</select></label> : <><label>사용량 조회일수<input type="number" min="1" max="365" value={criteria.average_days} onChange={e => update({ average_days: Number(e.target.value) })} /></label><label>확보일수<input type="number" min="1" max="30" value={criteria.coverage_days} onChange={e => update({ coverage_days: Number(e.target.value) })} /></label></>}
      <label>조회 시작일<input type="date" value={criteria.date_from} onChange={e => update({ date_from: e.target.value })} /></label>
      <label>조회 종료일<input type="date" value={criteria.date_to} onChange={e => update({ date_to: e.target.value })} /></label>
      <label>납품일<input type="date" min={day()} max={criteria.date_to} aria-describedby="delivery-guidance" value={criteria.delivery_date} onChange={e => update({ delivery_date: e.target.value })} /></label>
      <label>공급사 사업장<select className="workplace-select" value={criteria.sold_to ? (criteria.supplier_code || 'WELSTORY') + ':' + criteria.sold_to : ''} onChange={e => { const [supplier_code = '', sold_to = ''] = e.target.value.split(':'); update({ sold_to, supplier_code }) }}><option value="">전체 공급사·사업장</option>{sites.map(site => <option key={site.supplier_account_site_id} value={site.supplier_code + ':' + site.external_site_code}>{site.supplier_name} · {site.external_site_name} ({site.external_site_code})</option>)}</select></label>
      <button type="button" className="is-query" disabled={loading || previewing} onClick={() => setRevision(value => value + 1)}>{loading ? '조회 중…' : '부족재고 조회'}</button>
      <label className="shortage-order-check"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />60초마다 다시 조회</label>
    </section></div>
    <Link to={`/order_manager/order?${new URLSearchParams({ tab: 'products', account_id: accountId })}`}>새 상품·미연결 식자재 발주</Link>
    <details id="delivery-guidance" className="shortage-delivery-guidance" aria-label="납품일과 발주 마감 안내">
      <summary>납품일·발주 마감 안내</summary>
      <p>상품별 리드타임과 주문 마감시간을 확인한 후 납품일을 선택해주세요. 리드타임 1일 상품은 당일 납품을 요청할 수 없습니다.</p>
      <p>표시 시간은 한국시간입니다. 평일 마감 기준은 토·일요일과 공휴일에 그대로 적용되지 않으며, 물류센터·사업장 배송일과 공급사 공지에 따라 달라집니다. 상품 조회 성공이 주문 접수를 보장하지는 않습니다.</p>
      {criteria.delivery_date === guidanceNow.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) ? <p className="shortage-order-error" role="status">당일 납품을 선택했습니다. 리드타임이 1일 이상인 상품은 납품일을 변경해주세요.</p> : null}
    </details>
    </div>
    {/* 표 위 안내: 한 문단 안에서 항목별로 줄을 나눈다(줄 간격 최소). 줄 앞 이름표로 무슨 내용인지 바로 보이게 */}
    <p className="shortage-info-line">
      <span><em>기준</em>{criteria.source === 'DRAFT' ? <><strong className="is-source">구성 중인 식단 기준</strong> 저장하지 않은 식단의 메뉴·예정 식수로 계산 (<a href={`/operations/table-meals?account_id=${encodeURIComponent(accountId)}`}>식단 구성으로 돌아가기</a>)</>
        : criteria.source === 'STOCK' ? <><strong className="is-source">현재 부족 재고 바로 주문</strong> 현재고가 없거나 안전재고보다 적은 식자재. 안전재고·사용 이력이 없으면 <b>수량 직접 입력</b>(일괄 선택 시 최소 발주수량)</>
        : criteria.source === 'INVENTORY' ? <><strong className="is-source">최근 사용량 기준 부족 예상</strong> 최근 평균 사용량 × 확보일수 + 안전재고. <b>사용 확정 이력이 없으면 필요량 0</b></>
        : <><strong className="is-source">식단표 기준 부족량</strong> 저장된 식단 필요량 + 안전재고 − 현재고 − 입고예정</>}</span>
      <span><em>상품 준비</em><CatalogPreparation inline key={accountId + criteria.delivery_date} accountId={accountId} date={criteria.delivery_date} onReady={() => setRevision(n => n + 1)} /></span>
      <span><em>일괄 선택</em><b className="is-warn">납품·마감 확인 필요 상품은 제외</b> · 발주 가능 표시는 접수 보장이 아니며 발주 확정 때 다시 검증</span>
    </p>
    {error ? <p className="shortage-order-error" role="alert">{error}</p> : null}
    <div className="procurement-order-layout"><section className="procurement-order-items" aria-label="부족 식재료와 공급상품">
    <div className="shortage-table-controls"><div className="shortage-stock-filter" role="group" aria-label="재고 상태 필터">{([['', '전체'], ['RED', '🔴 필요량 부족'], ['YELLOW', '🟡 안전재고 미달'], ['CHECK', '⚪ 확인 필요']] as const).map(([value, label]) =>
      <button key={value} type="button" aria-pressed={stockFilter === value} className={stockFilter === value ? 'is-active' : ''} onClick={() => setStockFilter(value)}>{label} {stockCounts[value]}</button>)}</div>
    <div className="shortage-order-toolbar"><input aria-label="부족 식재료 검색" placeholder="부족 식재료 검색" value={keyword} onChange={e => setKeyword(e.target.value)} /><span>부족·확인 {result?.ingredients.length || 0}건{stockFilter ? ` · 표시 ${rows.length}건` : ''} · 선택 {selectionCount}건</span><button disabled={loading} title="지금 표시된 품목(필터·검색 중이면 보이는 품목만) 중 납품·마감 조건이 확인된 상품을 선택합니다. 수량 직접 입력 품목은 최소 발주수량으로 담기니 수량을 확인하세요." onClick={() => setSelected(current => ({ ...(stockFilter || keyword ? current : {}), ...Object.fromEntries(rows.flatMap(row => { const offer = row.offers.find(o => o.orderable && o.orderability_status === 'AVAILABLE'); return offer ? [[row.ingredient_id, { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, order_qty: offer.recommended_qty }]] : [] })) }))}>조건 만족 품목 선택</button><button onClick={() => setSelected({})}>선택 해제</button></div></div>
    <div className="shortage-order-table-wrap"><table className="shortage-order-table"><thead><tr><th>선택</th><th>식재료 / 필요 메뉴</th><th>필요량</th><th>안전재고</th><th>현재고</th><th>기발주 미입고</th><th>부족량</th><th>공급상품 / 상태</th><th>발주수량</th><th>예상 상품금액</th></tr></thead><tbody>
      {rows.map(row => {
        const selection = selected[row.ingredient_id]
        const offer = row.offers.find(o => o.supplier_offer_id === selection?.supplier_offer_id) || row.offers.find(o => o.orderable)
        const choose = (id: number) => { const next = row.offers.find(o => o.supplier_offer_id === id && o.orderable); if (next && (next.orderability_status === 'AVAILABLE' || window.confirm(next.product_name + ' · ' + criteria.delivery_date + '\n공급사에 납품 가능일과 마감 조건을 직접 확인하셨습니까? 확인한 경우에만 선택하세요.'))) setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: next.supplier_offer_id, order_qty: next.recommended_qty, delivery_terms_confirmed: next.orderability_status !== 'AVAILABLE' } })) }
        const qty = selection?.order_qty ?? offer?.recommended_qty ?? 0
        return <tr key={row.ingredient_id} className={row.ingredient_id === focusIngredient ? 'is-focused' : ''}><td><input aria-label={`${row.ingredient_name} 선택`} type="checkbox" checked={Boolean(selection)} disabled={!offer || loading} onChange={e => { if (e.target.checked && offer) choose(offer.supplier_offer_id); else setSelected(current => { const next = { ...current }; delete next[row.ingredient_id]; return next }) }} /></td><td><strong>{row.ingredient_name}</strong>{row.quantity_basis === 'MANUAL' ? <span className="shortage-stock-badge is-red">현재고 없음 · 수량 직접 입력</span> : shortageStockStatus(row) !== 'GREEN' ? <span className={`shortage-stock-badge is-${shortageStockStatus(row).toLowerCase()}`}>{SHORTAGE_STOCK_LABELS[shortageStockStatus(row)]}</span> : null}<small>{row.menu_names.filter(Boolean).join(', ')}</small>{row.issues.map(issue => <small className="shortage-order-error" key={issue}>{issue}</small>)}</td>
          {[row.required_qty, row.safe_stock_qty, row.current_qty, row.incoming_qty, row.shortage_qty].map((value, i) => <td key={i}>{number(value)} {row.base_unit}</td>)}
          <td><select aria-label={`${row.ingredient_name} 공급상품`} value={offer?.supplier_offer_id || ''} disabled={loading || !row.offers.some(o => o.orderable)} onChange={e => choose(Number(e.target.value))}><option value="">발주 가능한 상품 없음</option>{row.offers.map(o => <option key={o.supplier_offer_id} value={o.supplier_offer_id} disabled={!o.orderable}>{o.supplier_name} · {o.external_site_name || o.external_site_code} · {o.product_name} · {o.orderable ? `${money(o.purchase_price)}원/${o.order_unit}` : o.availability_reason || '발주 불가'}</option>)}</select>{offer ? <small>1 {offer.order_unit} = {number(offer.package_base_qty)} {row.base_unit} · {taxLabel(offer.tax_type)}</small> : <small className="shortage-order-error">{row.offers.map(o => o.availability_reason).filter(Boolean).join(' / ') || '선택한 사업장·납품일의 공급상품 연결을 확인해주세요.'}</small>}{offer ? <><small className="shortage-delivery-terms">{deliveryTerms(offer)}</small>{deliveryWarning(offer, criteria.delivery_date, guidanceNow) ? <small className="shortage-order-error" role="status">{deliveryWarning(offer, criteria.delivery_date, guidanceNow)}</small> : null}</> : row.offers.map(candidate => <small key={candidate.supplier_offer_id}>{candidate.product_name} · {deliveryTerms(candidate)}</small>)}</td>
          <td>{offer ? <><input aria-label={`${row.ingredient_name} 발주수량`} type="number" min={offer.minimum_order_qty} step={offer.order_increment_qty} max={offer.quantity_basis === 'MANUAL' ? MANUAL_MAX_ORDER_QTY : offer.recommended_qty} disabled={!selection || loading} value={qty} onChange={e => setSelected(current => ({ ...current, [row.ingredient_id]: { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, delivery_terms_confirmed: selection?.delivery_terms_confirmed, order_qty: Number(e.target.value) } }))} /> {offer.order_unit}<small>{offer.quantity_basis === 'MANUAL' ? `수량 직접 입력 (기본 ${number(offer.recommended_qty)} ${offer.order_unit})` : `권장 ${number(offer.recommended_qty)} ${offer.order_unit}`}</small></> : '—'}</td><td>{offer ? `${money(qty * offer.purchase_price)}원` : '—'}</td></tr>
      })}
      {!rows.length ? <tr><td colSpan={10}>{loading ? '부족량을 조회하고 있습니다.' : stockFilter && result?.ingredients.length ? '선택한 재고 상태에 해당하는 식재료가 없습니다.' : '선택한 기준에 해당하는 부족 식재료가 없습니다.'}</td></tr> : null}
    </tbody></table></div>
    <div className="shortage-order-footer"><span>조회 시각 {result?.checked_at.replace('T', ' ').slice(0, 19) || '—'}{result?.unconfigured_count ? ` · 필요량 기준 없는 품목 ${result.unconfigured_count}건` : ''}</span></div>
    </section><aside className="procurement-summary" aria-label="발주 요약">
      <h2>발주 요약</h2><button disabled={submitting || previewing} onClick={() => { try { startNewMixedProcurement(accountId); setBatchResult(null); setCompleted(false); setSelected({}); setPreview(null); setRevision(value => value + 1); setError('') } catch (e) { setError(e instanceof Error ? e.message : '기존 발주 확인 필요') } }}>새 발주 작성</button><p>공급사·사업장·납품일별로 발주서가 나뉩니다.</p><button disabled={submitting} onClick={() => { setSubmitting(true); void recoverMixedProcurement(accountId).then(setBatchResult).catch(e => setError(e.message)).finally(() => setSubmitting(false)) }}>이전 요청 결과 확인</button><BatchOrderResults result={preview ? null : batchResult} accountId={accountId} /><p>{selectedSuppliers.join(' · ') || '상품을 선택해주세요'}</p>
      <dl><div><dt>선택 품목</dt><dd>{selectionCount}개</dd></div><div><dt>납품일</dt><dd>{criteria.delivery_date || '미선택'}</dd></div><div><dt>공급사 사업장</dt><dd>{sites.find(site => site.external_site_code === criteria.sold_to)?.external_site_name || criteria.sold_to || '전체 공급사·사업장'}</dd></div></dl>
      <div className="procurement-summary__total"><span>예상 상품금액</span><strong>{loading ? '조회 중…' : `${money(selectedAmount)}원`}</strong></div>
      <p className="procurement-summary__hint">선택한 상품의 판가 × 발주수량입니다. 최종 금액과 발주 가능 여부는 발주서 확인 시 검증합니다.</p>
      <button className="is-primary" disabled={!selectionCount || loading || previewing} onClick={() => void makePreview()}>{previewing ? '서버 검증 중…' : '발주서 확인'}</button>
      <div className="procurement-summary__formula"><strong>부족량 계산 기준</strong><p>필요량 + 안전재고 − 현재고 − 기발주 미입고량</p><span>같은 식재료는 메뉴와 창고에 걸쳐 합산하고 현재고는 한 번만 차감합니다.</span></div>
    </aside></div>
    {preview ? createPortal(<div className="shortage-order-page shortage-order-overlay"><section className="shortage-order-sheet" role="dialog" aria-modal="true" aria-labelledby="shortage-sheet-title"><h2 id="shortage-sheet-title">부족 식재료 발주 미리보기</h2><p>납품일 {preview.criteria.delivery_date} · 발주서 {new Set(preview.items.map(row => row.offer.supplier_code + ':' + row.offer.external_site_code)).size}건 (공급사·사업장별 분리)</p><div className="shortage-order-table-wrap"><table className="shortage-order-table"><thead><tr><th>식재료 / 공급상품</th><th>필요량</th><th>안전재고</th><th>현재고</th><th>기발주 미입고</th><th>부족량</th><th>발주수량</th><th>포장당 판가</th><th>상품금액</th><th>공급가액 / 부가세</th></tr></thead><tbody>{preview.items.map(row => <tr key={row.ingredient_id}><td><strong>{row.ingredient_name}</strong><small>{row.offer.supplier_name} · {row.offer.external_site_name || row.offer.external_site_code} · {row.offer.supplier_item_code}</small><small className="shortage-delivery-terms">{deliveryTerms(row.offer)}</small>{deliveryWarning(row.offer, preview.criteria.delivery_date, guidanceNow) ? <small className="shortage-order-error" role="status">{deliveryWarning(row.offer, preview.criteria.delivery_date, guidanceNow)}</small> : null}</td>{[row.required_qty, row.safe_stock_qty, row.current_qty, row.incoming_qty, row.shortage_qty].map((value, i) => <td key={i}>{number(value)} {row.base_unit}</td>)}<td>{number(row.order_qty)} {row.offer.order_unit}<small>{number(row.ordered_base_qty)} {row.base_unit}</small></td><td>{money(row.offer.purchase_price)}원/{row.offer.order_unit}</td><td>{money(row.item_amount)}원</td><td>{row.supply_amount !== null ? `${money(row.supply_amount)}원 / 0원 (면세)` : taxLabel(row.tax_type)}</td></tr>)}</tbody></table></div><p className="shortage-order-total">상품금액 합계 {money(preview.item_amount)}원</p><p>상품금액은 공급사 판가 × 발주수량입니다. 과세 품목은 판가의 부가세 포함 여부가 확인되지 않아 세액을 임의로 더하지 않습니다. 공급가액·부가세는 공급사 정산 기준 확인이 필요합니다.</p><p className="shortage-delivery-guidance">납품일·리드타임·마감시간을 다시 확인해주세요. 평일 일반 마감과 주말·공휴일 마감은 다를 수 있으며, 사업장 배송일과 공급사 공지가 우선합니다. 발주 접수 후 실제 입고가 확정될 때 현재고에 반영됩니다.</p><p>주문 직전에 판매상태·실시간 가격·최소수량·발주배수와 최신 부족량을 다시 검증합니다.</p>{message ? <p role="status">{message}</p> : null}<BatchOrderResults result={batchResult} accountId={accountId} /><div className="shortage-order-actions"><button className="print-button" disabled={submitting} onClick={() => window.print()}><PrintIcon />미리보기 인쇄</button><button disabled={submitting} onClick={closePreview}>닫기</button><button className="is-primary" disabled={submitting || completed} onClick={() => void submit()}>{submitting ? '검증·발주 중…' : completed ? '발주 결과 확인됨' : '공급사 API 발주'}</button></div></section>{submitting ? <LoadingScreen overlay message={'공급사에 발주를 보내고 있습니다.\n창을 닫거나 새로고침하지 마세요.'} /> : null}</div>, document.body) : null}
  </>
  if (embedded) return <div className="shortage-order-page procurement-refresh">{body}</div>
  return <div className="shortage-order-page procurement-refresh"><SideMenuLayout header={<HeaderBar title="부족 식재료 발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: '부족 식재료 발주' }]} />}>{body}</SideMenuLayout></div>
}
export default FoodOrder
