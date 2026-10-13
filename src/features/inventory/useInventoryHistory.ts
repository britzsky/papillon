import { useEffect, useMemo, useState } from 'react'
import {
  getInventoryMovementSummary,
  getInventoryMovements,
  type InventoryMovement,
  type InventoryMovementQuery,
  type InventoryMovementSummary,
} from '../../api/inventory'

export const HISTORY_PAGE_SIZE = 50

/** 변동 구분 라벨과 상태 색 (workspace-status 변형) */
export const TYPE_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  IN: { label: '입고', tone: 'success' },
  OUT: { label: '사용', tone: 'warning' },
  RETURN: { label: '복원', tone: 'neutral' },
  ADJUST: { label: '실사 조정', tone: 'neutral' },
  DISCARD: { label: '폐기', tone: 'danger' },
  OPENING: { label: '기초재고', tone: 'neutral' },
}

/** 구분 탭 → 서버 movement_type 목록 */
export const TYPE_TABS = [
  { key: 'all', label: '전체', types: '' },
  { key: 'in', label: '입고', types: 'IN' },
  { key: 'out', label: '사용', types: 'OUT' },
  { key: 'return', label: '복원', types: 'RETURN' },
  { key: 'adjust', label: '조정·폐기', types: 'ADJUST,DISCARD' },
  { key: 'opening', label: '기초재고', types: 'OPENING' },
] as const
export type HistoryTabKey = (typeof TYPE_TABS)[number]['key']

export const SUMMARY_ORDER = ['IN', 'OUT', 'RETURN', 'ADJUST', 'DISCARD', 'OPENING']

export const dateText = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
export const historyDaysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return dateText(date) }
export const historyQty = (value: number | undefined) => Number(value ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
export const historyWon = (value: number | undefined) => `${Math.round(Number(value ?? 0)).toLocaleString('ko-KR')}원`
export const signed = (value: number, text: string) => `${value > 0 ? '+' : ''}${text}`
export const shortDate = (value?: string) => (value ? String(value).slice(5, 10).replace('-', '/') : '')
export const movementTime = (value: string) => String(value).replace('T', ' ').slice(0, 16)

/** 근거 업무를 사람이 읽을 수 있는 문구로 */
export function referenceText(row: InventoryMovement) {
  switch (row.reference_type) {
    case 'MEAL_SERVICE': {
      const meal = [row.meal_date, row.meal_slot_name].filter(Boolean).join(' ')
      const action = row.movement_type === 'RETURN' ? '사용 확정 취소' : '사용 확정'
      return { title: meal ? `${meal} ${action}` : action, detail: row.menu_name ?? '' }
    }
    case 'GOODS_RECEIPT':
      return { title: row.receipt_date ? `${row.receipt_date} 공급사 입고` : '공급사 입고', detail: row.purchase_order_id ? '' : '발주 연결 없음' }
    case 'DIRECT_PURCHASE':
      return { title: '직접구매 입고', detail: '마트·온라인 등' }
    case 'OPENING':
      return { title: '기초재고 등록', detail: '' }
    case 'OPENING_ESTIMATED':
      return { title: '기초재고 등록', detail: '공급가 기반 추정 단가' }
    case 'MANUAL':
      return { title: '재고 수량 직접 조정', detail: '' }
    default:
      return { title: row.reference_type || '기타', detail: '' }
  }
}

/**
 * 재고 변동 이력 조회(PC·터치 공용): 기간·검색어·구분·상품 지정 → 목록(페이지) + 구분별 합계.
 * 응답을 요청 키와 함께 보관해, 키가 다르면 '조회 중'으로 본다.
 */
export function useInventoryHistory(accountId: string, productId: string, ingredientId: string) {
  const [from, setFrom] = useState(() => historyDaysAgo(30))
  const [to, setTo] = useState(() => dateText(new Date()))
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<HistoryTabKey>('all')
  const [page, setPage] = useState({ key: '', offset: 0 })
  const [result, setResult] = useState<{ key: string; rows: InventoryMovement[]; error: string }>({ key: '', rows: [], error: '' })
  const [summaryResult, setSummaryResult] = useState<{ key: string; items: InventoryMovementSummary[] }>({ key: '', items: [] })
  const [focusName, setFocusName] = useState('')

  const ready = Boolean(accountId) && Boolean(from) && Boolean(to) && from <= to
  const query = useMemo<InventoryMovementQuery>(() => ({
    account_id: accountId,
    date_from: from,
    date_to: to,
    keyword: keyword || undefined,
    movement_type: TYPE_TABS.find(item => item.key === tab)?.types || undefined,
    account_ingredient_product_id: productId || undefined,
    ingredient_id: ingredientId || undefined,
  }), [accountId, from, to, keyword, tab, productId, ingredientId])
  // 조회 조건이 바뀌면 페이지는 자동으로 처음부터
  const queryKey = JSON.stringify(query)
  const offset = page.key === queryKey ? page.offset : 0
  const requestKey = `${queryKey}#${offset}`

  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    Promise.all([
      getInventoryMovements({ ...query, limit: HISTORY_PAGE_SIZE, offset }, controller.signal),
      // 합계는 조건이 같으면 페이지를 넘겨도 그대로라 첫 페이지에서만 받는다
      offset === 0 ? getInventoryMovementSummary(query, controller.signal) : Promise.resolve(null),
    ])
      .then(([list, totals]) => {
        if (controller.signal.aborted) return
        setResult({ key: requestKey, rows: list, error: '' })
        if (totals) setSummaryResult({ key: queryKey, items: totals })
        if ((query.account_ingredient_product_id || query.ingredient_id) && list[0]) setFocusName(list[0].ingredient_name || list[0].product_name || '')
      })
      .catch(e => {
        if (controller.signal.aborted) return
        setResult({ key: requestKey, rows: [], error: e instanceof Error ? e.message : '조회에 실패했습니다.' })
        setSummaryResult({ key: queryKey, items: [] })
      })
    return () => controller.abort()
  }, [ready, query, offset, queryKey, requestKey])

  const loading = ready && result.key !== requestKey
  const error = ready && !loading ? result.error : ''
  const rows = ready && !loading ? result.rows : []
  const summary = ready && summaryResult.key === queryKey ? summaryResult.items : []
  const total = summary.reduce((sum, item) => sum + item.movement_count, 0)
  const netAmount = summary.reduce((sum, item) => sum + item.amount_sum, 0)
  // 수량 합계는 단위가 하나로 모일 때만(대개 한 상품만 볼 때) 의미가 있다
  const units = new Set(summary.map(item => item.base_unit))
  const showQty = summary.length > 0 && summary.every(item => item.unit_count === 1) && units.size === 1
  const orderedSummary = SUMMARY_ORDER.flatMap(type => summary.filter(item => item.movement_type === type))

  const setPeriod = (days: number) => { setFrom(historyDaysAgo(days)); setTo(dateText(new Date())) }
  const movePage = (nextOffset: number) => setPage({ key: queryKey, offset: Math.max(0, nextOffset) })

  return {
    from, setFrom, to, setTo, keyword, setKeyword, tab, setTab, focusName, setFocusName, setPeriod,
    ready, loading, error, rows, offset, movePage, total, netAmount, showQty, orderedSummary,
  }
}
