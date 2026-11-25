import { workspaceAccountId } from '../workspace/workspaceAccount'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { clearDeadlineAlertCache } from '../../api/deadlineAlerts'
import { submitMixedProcurement, type BatchResult } from '../../api/mixedProcurement'
import { getTableMealsList, type TableMealsItem } from '../../api/operations'
import { getSupplierSites, type SupplierSite } from '../../api/supplierIntegration'
import { getPlanDates, getShortages, MANUAL_MAX_ORDER_QTY, matchesStockFilter, previewShortageOrder, shortageStockStatus, type OrderPreview, type OrderSelection, type ShortageCriteria, type ShortageResult, type ShortageOffer, type ShortageRow, type ShortageStockFilter } from '../../api/shortageProcurement'
import { showAlert, showOrderResult } from '../../utils/dialog'

export const day = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toLocaleDateString('sv-SE') }
const shiftDay = (value: string, days: number) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const isSunday = (value: string) => new Date(`${value}T00:00:00Z`).getUTCDay() === 0
/** 다음 납품 가능일(일요일엔 납품이 없다) */
export const nextDeliveryDay = (value: string) => { const next = shiftDay(value, 1); return isSunday(next) ? shiftDay(next, 1) : next }
/**
 * 납품일이 맡는 식단 기간(2026-11-19 사용자 결정): 납품 다음 날 ~ 다음 납품일. 토요일 납품 = 일·월 식단, 월요일 납품 = 화 식단.
 * 요일 표를 두지 않고 '일요일 납품 없음'만 쓴다. 더 길게 받고 싶으면 마지막 식단일(date_to)만 늘린다.
 */
export const coverFor = (delivery: string) => ({ date_from: shiftDay(delivery, 1), date_to: nextDeliveryDay(delivery) })
/** 식단일을 받을 납품일: 전날, 전날이 일요일이면 토요일. 오늘보다 앞이면 오늘 */
export const deliveryFor = (mealDate: string) => { const before = shiftDay(mealDate, -1); const d = isSunday(before) ? shiftDay(before, -1) : before; return d < day() ? day() : d }
export const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })
export const money = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
export const taxLabel = (value: string) => value === 'No tax' ? '면세' : ['Full tax', 'CONS', 'CONS(소모품)'].includes(value) ? '과세 · 세액 확인 필요' : '과세정보 확인 필요'

const statusRank = { RED: 0, YELLOW: 1, GREEN: 2 } as const

/** 바로 시킬 수 있는 품목(납품·마감 조건이 확인된 첫 상품)을 추천 수량으로 고른다. '모두 선택'과 식단표에서 넘어올 때 자동 선택이 같이 쓴다. */
export function availableSelection(rows: ShortageResult['ingredients']): Record<string, OrderSelection> {
  return Object.fromEntries(rows.flatMap(row => {
    const offer = row.offers.find(o => o.orderable && o.orderability_status === 'AVAILABLE')
    return offer ? [[row.ingredient_id, { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, order_qty: offer.recommended_qty }]] : []
  }))
}

/** 추천 발주안(2026-11-23 식단표 기준 화면으로 통일): 늘 쓰는 상품(recommended_offer_id)이 바로 발주 가능하고 확인할 점이 없는 품목만 미리 고른다 */
export function recommendedSelection(rows: ShortageResult['ingredients']): Record<string, OrderSelection> {
  return Object.fromEntries(rows.flatMap(row => {
    const offer = row.offers.find(o => o.supplier_offer_id === row.recommended_offer_id && o.orderable && o.orderability_status === 'AVAILABLE')
    return offer && !row.issues.length ? [[row.ingredient_id, { ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, order_qty: offer.recommended_qty }]] : []
  }))
}

export function deliveryTerms(offer: ShortageOffer) {
  const state = offer.orderability_status === 'AVAILABLE' ? '발주 가능' : offer.orderability_status === 'UNAVAILABLE' ? '발주 불가' : '확인 필요'
  return state + ' · ' + (offer.orderability_reason || '납품일자·마감 조건 확인 요망')
}


export function deliveryWarning(offer: ShortageOffer, deliveryDate: string, now: Date) {
  const lead = Number(offer.lead_time_days)
  if (offer.lead_time_days == null || !Number.isInteger(lead) || lead < 0 || !deliveryDate) return ''
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const earliest = new Date(today + 'T00:00:00Z')
  earliest.setUTCDate(earliest.getUTCDate() + lead)
  if (deliveryDate < earliest.toISOString().slice(0, 10)) return 'D-' + lead + ' 품목 · 준비기간 부족 · 납품일자 변경 요망'
  return ''
}

/** 기준단위 100g(또는 100ml·1개)당 가격. 같은 식재료의 공급사 상품끼리 비교할 때 쓴다. */
export function unitCost(offer: ShortageOffer, unit: string) {
  const qty = Number(offer.package_base_qty) || 0
  if (!qty || !offer.purchase_price) return null
  const u = unit.toLowerCase()
  const factor = u === 'g' || u === 'ml' ? 100 : u === 'kg' || u === 'l' ? 0.1 : 1
  return { value: offer.purchase_price / qty * factor, per: u === 'g' || u === 'kg' ? '100g' : u === 'ml' || u === 'l' ? '100ml' : unit }
}
export function per100(offer: ShortageOffer, unit: string) {
  const cost = unitCost(offer, unit)
  return cost ? `${cost.per}당 ${money(Math.round(cost.value))}원` : ''
}
/** 상품 선택칸 순서: 늘 쓰는 상품(기본 상품) 맨 위 고정 → 나머지 기준단위당 싼 순 → 발주 불가는 뒤로 */
export function offerOptions(row: ShortageRow) {
  return [...row.offers].sort((a, b) => {
    if (a.supplier_offer_id === row.recommended_offer_id) return -1
    if (b.supplier_offer_id === row.recommended_offer_id) return 1
    if (a.orderable !== b.orderable) return a.orderable ? -1 : 1
    const ca = unitCost(a, row.base_unit), cb = unitCost(b, row.base_unit)
    return ca && cb ? ca.value - cb.value : ca ? -1 : cb ? 1 : 0
  })
}
/**
 * 부족량 기준 발주(PC 발주하기의 식단표·현재 부족·사용량 탭, 터치 화면 공용): 조회 조건(주소·식단 구성 화면에서 넘어온 DRAFT 포함),
 * 부족 식재료 조회·자동 새로고침, 품목별 상품·수량 선택, 서버 검증 미리보기, 공급사별 혼합 발주.
 * fixedSource: 발주하기의 기준 탭이 정한 계산 기준.
 */
export function useShortageOrder(fixedSource?: 'PLAN' | 'STOCK' | 'INVENTORY' | 'FAVORITE_MENU', override?: Record<string, string>) {
  // override: 주소 대신 쓰는 조회 조건(m버전 홈의 '다음 할 일' 시트가 화면 이동 없이 발주서를 열 때). 첫 렌더 값만 쓴다
  const [urlParams] = useSearchParams()
  const [frozen] = useState(() => {
    const merged = new URLSearchParams(urlParams)
    Object.entries(override || {}).forEach(([key, value]) => merged.set(key, value))
    return merged
  })
  const params = override ? frozen : urlParams
  const accountId = workspaceAccountId(params)
  const focusIngredient = params.get('ingredient_id') || ''
  // 마감 알림에서 정해 온 납품일(첫 렌더 값). 식단표 기간을 불러와도 이 납품일을 유지한다
  const requestedDeliveryRef = useRef(/^\d{4}-\d{2}-\d{2}$/.test(params.get('delivery_date') || '') && (params.get('delivery_date') as string) >= day() ? params.get('delivery_date') as string : '')
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
    const source = fixedSource ?? (params.get('source') === 'PLAN' || (!params.get('source') && params.get('table_id')) ? 'PLAN' : params.get('source') === 'STOCK' ? 'STOCK' : 'INVENTORY')
    // 식단 기준: 납품일이 맡는 기간(납품 다음 날 ~ 다음 납품일)만 계산한다. 그 전 식단 사용량은 서버가 먼저 뺀다
    if (source === 'PLAN') { const delivery = requestedDelivery || day(1); return { account_id: accountId, source, table_id: params.get('table_id') || '', ...coverFor(delivery), delivery_date: delivery, sold_to: '', average_days: 30, coverage_days: 1, all_tables: 'Y' } }
    return ({
    account_id: accountId, source,
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
  // 식단표의 '저장하고 발주하기'(?autoselect=1): 식단 기간이 정해진 첫 조회에서 바로 시킬 수 있는 품목을 미리 고른다(한 번만).
  const autoSelectPending = useRef(params.get('autoselect') === '1')
  // autoselect_mode=recommended: 추천 발주안 탭(늘 쓰는 상품만 미리 고름)
  const autoSelectRecommended = useRef(params.get('autoselect_mode') === 'recommended')
  const planDatesLoaded = useRef(false)
  // 탭을 옮겼다 돌아와도 담은 품목을 기억한다(2026-11-25 사용자 요청). 거래처·기준·납품일마다 sessionStorage에 두고,
  // 그 조합으로 처음 조회가 끝나면 지금 목록에서 아직 시킬 수 있는 것만 되살린다. 되살리기 전에는 저장하지 않는다(빈 선택으로 덮지 않게).
  const picksKey = `order-picks:${accountId}:${criteria.source}:${criteria.delivery_date}`
  const restoredPicks = useRef(new Set<string>())

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
      planDatesLoaded.current = true
      if (!active || !dates.length) return
      // 식단표 첫날을 받을 납품일(전날, 일요일이면 토요일)과 그 납품이 맡는 기간. 알림에서 납품일을 정해 왔으면 그 납품일
      const delivery = requestedDeliveryRef.current || deliveryFor(dates[0] < day() ? day() : dates[0])
      setCriteria(current => ({ ...current, ...coverFor(delivery), delivery_date: delivery, all_tables: 'Y' }))
    }).catch((e: unknown) => { planDatesLoaded.current = true; if (active) setError(e instanceof Error ? e.message : '식단 기간 조회 실패') })
    return () => { active = false }
  }, [accountId, criteria.table_id, criteria.source])

  useEffect(() => {
    if (!criteria.account_id) return
    const controller = new AbortController()
    setLoading(true); setError(''); setPreview(null)
    void getShortages(criteria, controller.signal).then(data => {
      if (controller.signal.aborted) return
      setResult(data)
      const valid = (id: string, selection: OrderSelection) => {
        const offer = data.ingredients.find(row => row.ingredient_id === id)?.offers.find(candidate => candidate.supplier_offer_id === selection.supplier_offer_id)
        return Boolean(offer?.orderable && selection.order_qty > 0 && selection.order_qty <= (offer.quantity_basis === 'MANUAL' ? MANUAL_MAX_ORDER_QTY : offer.recommended_qty))
      }
      const firstForKey = !restoredPicks.current.has(picksKey)
      restoredPicks.current.add(picksKey)
      if (autoSelectPending.current) {
        // 식단 기간 조회가 끝나기 전 첫 조회 결과는 기간이 달라 다시 조회되므로 그때 고른다
        if (criteria.source !== 'PLAN' || !criteria.table_id || planDatesLoaded.current) autoSelectPending.current = false
        setSelected(autoSelectRecommended.current ? recommendedSelection(data.ingredients) : availableSelection(data.ingredients))
        return
      }
      let remembered: Record<string, OrderSelection> = {}
      if (firstForKey) { try { remembered = JSON.parse(sessionStorage.getItem(picksKey) || '{}') || {} } catch { remembered = {} } }
      setSelected(current => Object.fromEntries(Object.entries({ ...remembered, ...current }).filter(([id, selection]) => valid(id, selection))))
    }).catch((e: unknown) => {
      if (!controller.signal.aborted) { setResult(null); setSelected({}); setError(e instanceof Error ? e.message : '부족재고 조회 실패') }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [criteria, revision, picksKey])
  useEffect(() => {
    if (!accountId || !restoredPicks.current.has(picksKey)) return
    try { if (Object.keys(selected).length) sessionStorage.setItem(picksKey, JSON.stringify(selected)); else sessionStorage.removeItem(picksKey) } catch { /* 저장소를 못 써도 발주는 된다 */ }
  }, [accountId, picksKey, selected])

  useEffect(() => {
    if (!autoRefresh || preview || submitting || previewing) return
    const timer = window.setInterval(() => setRevision(value => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, preview, submitting, previewing])

  const update = (patch: Partial<ShortageCriteria>) => {
    setSelected({}); setPreview(null); setMessage(''); setCriteria(current => ({ ...current, ...patch }))
  }
  /** 납품일 고르기: 식단 기준이면 그 납품이 맡는 기간(다음 날 ~ 다음 납품일)으로 바꾼다. 그 밖의 기준은 예전처럼 납품일만 */
  const chooseDelivery = (value: string) => {
    if (!value) return
    if (criteria.source === 'PLAN') update({ delivery_date: value, ...coverFor(value), all_tables: 'Y' })
    // 2026-11-25: 종료일은 '시작일+6일(기본 일주일)'과 납품일 중 늦은 날. 예전엔 늘리기만 해서 차주 납품을 골랐다가 이번 주로 돌아와도 차주 종료일이 남았음
    else { const base = shiftDay(criteria.date_from, 6); update({ delivery_date: value, date_to: value > base ? value : base }) }
  }
  /** 이 납품으로 쓸 마지막 식단일(더 길게 받기) */
  const chooseLastMealDay = (value: string) => { if (value && value >= criteria.date_from) update({ date_to: value }) }
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
      void showOrderResult(response)
    } catch (e) {
      const text = e instanceof Error ? e.message : '발주 결과를 확인하지 못했습니다.'
      setMessage(text); void showAlert('error', '발주에 실패했습니다', text)
    }
    finally { setSubmitting(false) }
  }
  const closePreview = () => { if (submitting) return; setPreview(null); setRevision(value => value + 1) }

  return { accountId, focusIngredient, criteria, setCriteria, chooseDelivery, chooseLastMealDay, guidanceNow, plans, sites, result, selected, setSelected, keyword, setKeyword, stockFilter, setStockFilter, autoRefresh, setAutoRefresh, revision, setRevision, loading, error, setError, message, setMessage, batchResult, setBatchResult, preview, setPreview, previewing, submitting, setSubmitting, completed, setCompleted, update, stockCounts, rows, selectionCount, selectedAmount, selectedSuppliers, makePreview, submit, closePreview }
}
