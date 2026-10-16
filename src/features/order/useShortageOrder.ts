import { workspaceAccountId } from '../workspace/workspaceAccount'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { clearDeadlineAlertCache } from '../../api/deadlineAlerts'
import { submitMixedProcurement, type BatchResult } from '../../api/mixedProcurement'
import { getTableMealsList, type TableMealsItem } from '../../api/operations'
import { getSupplierSites, type SupplierSite } from '../../api/supplierIntegration'
import { getPlanDates, getShortages, MANUAL_MAX_ORDER_QTY, matchesStockFilter, previewShortageOrder, shortageStockStatus, type OrderPreview, type OrderSelection, type ShortageCriteria, type ShortageResult, type ShortageOffer, type ShortageStockFilter } from '../../api/shortageProcurement'

export const day = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toLocaleDateString('sv-SE') }
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

/**
 * 부족량 기준 발주(PC 발주하기의 식단표·현재 부족·사용량 탭, 터치 화면 공용): 조회 조건(주소·식단 구성 화면에서 넘어온 DRAFT 포함),
 * 부족 식재료 조회·자동 새로고침, 품목별 상품·수량 선택, 서버 검증 미리보기, 공급사별 혼합 발주.
 * fixedSource: 발주하기의 기준 탭이 정한 계산 기준.
 */
export function useShortageOrder(fixedSource?: 'PLAN' | 'STOCK' | 'INVENTORY', override?: Record<string, string>) {
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
  // 식단표의 '저장하고 발주하기'(?autoselect=1): 식단 기간이 정해진 첫 조회에서 바로 시킬 수 있는 품목을 미리 고른다(한 번만).
  const autoSelectPending = useRef(params.get('autoselect') === '1')
  const planDatesLoaded = useRef(false)

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
      setCriteria(current => ({ ...current, date_from: dates[0], date_to: dates[dates.length - 1], delivery_date: dates[0] < day() ? day() : dates[0] }))
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
      if (autoSelectPending.current) {
        // 식단 기간 조회가 끝나기 전 첫 조회 결과는 기간이 달라 다시 조회되므로 그때 고른다
        if (criteria.source !== 'PLAN' || !criteria.table_id || planDatesLoaded.current) autoSelectPending.current = false
        setSelected(availableSelection(data.ingredients))
        return
      }
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

  return { accountId, focusIngredient, criteria, setCriteria, guidanceNow, plans, sites, result, selected, setSelected, keyword, setKeyword, stockFilter, setStockFilter, autoRefresh, setAutoRefresh, revision, setRevision, loading, error, setError, message, setMessage, batchResult, setBatchResult, preview, setPreview, previewing, submitting, setSubmitting, completed, setCompleted, update, stockCounts, rows, selectionCount, selectedAmount, selectedSuppliers, makePreview, submit, closePreview }
}
