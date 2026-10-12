import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import {
  getInventoryMovementSummary,
  getInventoryMovements,
  type InventoryMovement,
  type InventoryMovementQuery,
  type InventoryMovementSummary,
} from '../../api/inventory'
import '../operations/MenuManager.css'
import './InventoryHistory.css'

const PAGE_SIZE = 50

/** 변동 구분 라벨과 상태 색 (workspace-status 변형) */
const TYPE_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  IN: { label: '입고', tone: 'success' },
  OUT: { label: '사용', tone: 'warning' },
  RETURN: { label: '복원', tone: 'neutral' },
  ADJUST: { label: '실사 조정', tone: 'neutral' },
  DISCARD: { label: '폐기', tone: 'danger' },
  OPENING: { label: '기초재고', tone: 'neutral' },
}

/** 구분 탭 → 서버 movement_type 목록 */
const TYPE_TABS = [
  { key: 'all', label: '전체', types: '' },
  { key: 'in', label: '입고', types: 'IN' },
  { key: 'out', label: '사용', types: 'OUT' },
  { key: 'return', label: '복원', types: 'RETURN' },
  { key: 'adjust', label: '조정·폐기', types: 'ADJUST,DISCARD' },
  { key: 'opening', label: '기초재고', types: 'OPENING' },
] as const
type TabKey = (typeof TYPE_TABS)[number]['key']

const SUMMARY_ORDER = ['IN', 'OUT', 'RETURN', 'ADJUST', 'DISCARD', 'OPENING']

const dateText = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return dateText(date) }
const qty = (value: number | undefined) => Number(value ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const won = (value: number | undefined) => `${Math.round(Number(value ?? 0)).toLocaleString('ko-KR')}원`
const signed = (value: number, text: string) => `${value > 0 ? '+' : ''}${text}`
const shortDate = (value?: string) => (value ? String(value).slice(5, 10).replace('-', '/') : '')
const movementTime = (value: string) => String(value).replace('T', ' ').slice(0, 16)

/** 근거 업무를 사람이 읽을 수 있는 문구로 */
function referenceText(row: InventoryMovement) {
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

export default function InventoryHistory() {
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const productId = params.get('account_ingredient_product_id') || ''
  const ingredientId = params.get('ingredient_id') || ''

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [from, setFrom] = useState(() => daysAgo(30))
  const [to, setTo] = useState(() => dateText(new Date()))
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<TabKey>('all')
  const [page, setPage] = useState({ key: '', offset: 0 })
  // 응답을 요청 키와 함께 보관해, 키가 다르면 '조회 중'으로 본다
  const [result, setResult] = useState<{ key: string; rows: InventoryMovement[]; error: string }>({ key: '', rows: [], error: '' })
  const [summaryResult, setSummaryResult] = useState<{ key: string; items: InventoryMovementSummary[] }>({ key: '', items: [] })
  const [focusName, setFocusName] = useState('')

  useEffect(() => {
    let active = true
    void getAccountOptions().then(data => { if (active) setAccounts(data) }).catch(() => undefined)
    return () => { active = false }
  }, [])

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
      getInventoryMovements({ ...query, limit: PAGE_SIZE, offset }, controller.signal),
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
  const visibleRows = ready && !loading ? result.rows : []
  const visibleSummary = ready && summaryResult.key === queryKey ? summaryResult.items : []
  const total = visibleSummary.reduce((sum, item) => sum + item.movement_count, 0)
  const netAmount = visibleSummary.reduce((sum, item) => sum + item.amount_sum, 0)
  // 수량 합계는 단위가 하나로 모일 때만(대개 한 상품만 볼 때) 의미가 있다
  const units = new Set(visibleSummary.map(item => item.base_unit))
  const showQty = visibleSummary.length > 0 && visibleSummary.every(item => item.unit_count === 1) && units.size === 1
  const orderedSummary = SUMMARY_ORDER.flatMap(type => visibleSummary.filter(item => item.movement_type === type))

  const productLink = (row: InventoryMovement) =>
    `/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(row.account_ingredient_product_id) })}`
  const setPeriod = (days: number) => { setFrom(daysAgo(days)); setTo(dateText(new Date())) }
  const submitKeyword = (event: FormEvent) => { event.preventDefault(); setKeyword(keywordInput.trim()) }
  const movePage = (nextOffset: number) => setPage({ key: queryKey, offset: Math.max(0, nextOffset) })

  return (
    <div className="menu-manager-page">
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="재고 변동 이력" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '재고 변동 이력' }]} />}>
          <form className="menu-manager-filters inventory-history-filters" onSubmit={submitKeyword}>
            <div className="menu-manager-filter-grid">
              <div className="menu-manager-field">
                <label htmlFor="history-account">거래처</label>
                <select id="history-account" value={accountId} onChange={e => { setFocusName(''); setParams({ account_id: e.target.value }) }}>
                  <option value="">거래처 선택</option>
                  {accountId && !accounts.some(a => a.value === accountId) && <option value={accountId}>{accountId}</option>}
                  {accounts.map(a => <option key={a.value} value={a.value}>{a.text}</option>)}
                </select>
              </div>
              <div className="menu-manager-field">
                <label htmlFor="history-from">시작일</label>
                <input id="history-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="menu-manager-field">
                <label htmlFor="history-to">종료일</label>
                <input id="history-to" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
              </div>
              <div className="menu-manager-field inventory-history-keyword">
                <label htmlFor="history-keyword">식자재 검색</label>
                <div className="inventory-history-search">
                  <input id="history-keyword" value={keywordInput} onChange={e => setKeywordInput(e.target.value)} placeholder="식자재명, 상품명, 품목코드" />
                  <button type="submit" className="is-query">검색</button>
                </div>
              </div>
            </div>
            <div className="inventory-history-periods" role="group" aria-label="기간 빠른 선택">
              <button type="button" onClick={() => setPeriod(0)}>오늘</button>
              <button type="button" onClick={() => setPeriod(7)}>7일</button>
              <button type="button" onClick={() => setPeriod(30)}>30일</button>
              <button type="button" onClick={() => setPeriod(90)}>90일</button>
            </div>
          </form>

          <section className="menu-manager-panel">
            <div className="inventory-history-tabs" role="group" aria-label="변동 구분">
              {TYPE_TABS.map(item => (
                <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>

            {(productId || ingredientId || keyword) && (
              <div className="inventory-history-focus">
                {(productId || ingredientId) && (
                  <span>
                    <strong>{focusName || '선택한 상품'}</strong> 이력만 보는 중
                    <button type="button" onClick={() => { setFocusName(''); setParams({ account_id: accountId }) }}>전체 보기</button>
                  </span>
                )}
                {keyword && (
                  <span>
                    검색어 <strong>{keyword}</strong>
                    <button type="button" onClick={() => { setKeyword(''); setKeywordInput('') }}>지우기</button>
                  </span>
                )}
              </div>
            )}

            {orderedSummary.length > 0 && (
              <div className="inventory-history-summary" aria-live="polite">
                {orderedSummary.map(item => (
                  <div key={item.movement_type} className={`inventory-history-card inventory-history-card--${TYPE_META[item.movement_type]?.tone ?? 'neutral'}`}>
                    <span>{TYPE_META[item.movement_type]?.label ?? item.movement_type} {item.movement_count.toLocaleString('ko-KR')}건</span>
                    <strong>{signed(item.amount_sum, won(item.amount_sum))}</strong>
                    {showQty && <small>{signed(item.quantity_sum, qty(item.quantity_sum))} {item.base_unit}</small>}
                  </div>
                ))}
                <div className="inventory-history-card inventory-history-card--total">
                  <span>재고금액 순증감 · {total.toLocaleString('ko-KR')}건</span>
                  <strong>{signed(netAmount, won(netAmount))}</strong>
                  {!showQty && <small>여러 상품을 함께 볼 때는 수량 합계를 표시하지 않습니다</small>}
                </div>
              </div>
            )}

            {!accountId && <p role="alert" className="menu-manager-empty">거래처를 선택해주세요.</p>}
            {accountId && !ready && <p role="alert" className="menu-manager-empty">조회 기간을 확인해주세요.</p>}
            {error && <p role="alert" className="menu-manager-empty">{error}</p>}
            {loading && <p role="status" className="inventory-history-loading">이력을 조회하고 있습니다.</p>}

            <div className="menu-manager-table-scroll">
              <table className="menu-manager-table inventory-history-table">
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>구분</th>
                    <th>식자재 / 상품</th>
                    <th>근거</th>
                    <th>증감</th>
                    <th>이전 → 이후</th>
                    <th>금액</th>
                    <th>처리자</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => {
                    const meta = TYPE_META[row.movement_type] ?? { label: row.movement_type, tone: 'neutral' as const }
                    const reference = referenceText(row)
                    const delta = Number(row.quantity_delta)
                    const amount = Number(row.amount_delta ?? 0)
                    return (
                      <tr key={row.movement_id}>
                        <td className="inventory-history-nowrap">{movementTime(row.movement_at)}</td>
                        <td><span className={`workspace-status workspace-status--${meta.tone}`}>{meta.label}</span></td>
                        <td>
                          <Link className="inventory-history-product" to={productLink(row)} onClick={() => setFocusName(row.ingredient_name || row.product_name || '')} title="이 상품의 이력만 보기">
                            {row.ingredient_name || row.product_name || '상품정보 없음'}
                          </Link>
                          {row.product_name && row.product_name !== row.ingredient_name && <small>{row.product_name}</small>}
                          {row.supplier_name && <small>{row.supplier_name}</small>}
                        </td>
                        <td>
                          {reference.title}
                          {reference.detail && <small>{reference.detail}</small>}
                          {row.purchase_order_id && (
                            <Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: row.purchase_order_id })}`}>
                              발주서 보기{row.requested_delivery_date ? ` (납품 ${shortDate(row.requested_delivery_date)})` : ''}
                            </Link>
                          )}
                        </td>
                        <td className={`inventory-history-delta inventory-history-nowrap${delta > 0 ? ' is-plus' : delta < 0 ? ' is-minus' : ''}`}>
                          {signed(delta, qty(delta))} {row.base_unit}
                        </td>
                        <td className="inventory-history-nowrap">{qty(row.quantity_before)} → {qty(row.quantity_after)} {row.base_unit}</td>
                        <td className="inventory-history-nowrap">
                          {row.amount_delta == null ? '-' : signed(amount, won(amount))}
                          {Number(row.unit_cost_snapshot ?? 0) > 0 && <small>{Number(row.unit_cost_snapshot).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/{row.base_unit}</small>}
                        </td>
                        <td>{row.user_id || '시스템'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {ready && !loading && !error && visibleRows.length === 0 && <p className="menu-manager-empty">조회된 재고 변동이 없습니다.</p>}
            </div>

            <nav className="menu-manager-pagination">
              <span className="menu-manager-pagination__summary">
                {visibleRows.length ? `${offset + 1}-${offset + visibleRows.length}` : '0'} / {total.toLocaleString('ko-KR')}건
              </span>
              <div className="menu-manager-pagination__actions">
                <button type="button" disabled={loading || offset === 0} onClick={() => movePage(offset - PAGE_SIZE)}>이전</button>
                <button type="button" disabled={loading || offset + visibleRows.length >= total} onClick={() => movePage(offset + PAGE_SIZE)}>다음</button>
              </div>
            </nav>
          </section>
        </SideMenuLayout>
      </main>
    </div>
  )
}
