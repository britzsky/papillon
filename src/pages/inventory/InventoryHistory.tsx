import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import type { InventoryMovement } from '../../api/inventory'
import {
  HISTORY_PAGE_SIZE as PAGE_SIZE, TYPE_META, TYPE_TABS, historyQty as qty, historyWon as won, movementTime, referenceText, shortDate, signed, useInventoryHistory,
} from '../../features/inventory/useInventoryHistory'
import '../operations/MenuManager.css'
import './InventoryHistory.css'

// 이력 구분 색 → 개편 칩 색
const TONE = { success: 'ok', warning: 'warn', danger: 'urgent', neutral: 'done' } as const

/** 재고 변동 이력(PC). 조회 로직은 features/inventory/useInventoryHistory(터치 화면과 공용). */
export default function InventoryHistory() {
  const [params, setParams] = useSearchParams()
  const accountId = workspaceAccountId(params)
  const productId = params.get('account_ingredient_product_id') || ''
  const ingredientId = params.get('ingredient_id') || ''

  const [keywordInput, setKeywordInput] = useState('')
  const {
    from, setFrom, to, setTo, keyword, setKeyword, tab, setTab, focusName, setFocusName, setPeriod,
    ready, loading, error, rows: visibleRows, offset, movePage, total, netAmount, showQty, orderedSummary,
  } = useInventoryHistory(accountId, productId, ingredientId)


  const productLink = (row: InventoryMovement) =>
    `/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(row.account_ingredient_product_id) })}`
  const submitKeyword = (event: FormEvent) => { event.preventDefault(); setKeyword(keywordInput.trim()) }

  return (
    <div className="menu-manager-page">
      <main className="menu-manager-content">
        <SideMenuLayout header={<HeaderBar title="재고 변동 이력" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '재고 변동 이력' }]} />}>
          <div className="rd rd-page rd-hist">
            <header className="rd-page__head">
              <div>
                <h1 className="rd-h1">재고 변동 이력</h1>
                <p className="rd-muted">입고·사용·조정·폐기로 재고가 언제 얼마나 바뀌었는지 봅니다. 상품 이름을 누르면 그 상품 이력만 봅니다.</p>
              </div>
              <DeadlineAlertSlot />
              <div className="rd-page__actions">
                {accountId ? <Link className="rd-btn" to={`/inventory/account?${new URLSearchParams({ account_id: accountId })}`}>재고 화면</Link> : null}
              </div>
            </header>

            <form className="rd-card rd-page__filters" onSubmit={submitKeyword}>
              <input className="rd-input" type="search" aria-label="식자재 검색" value={keywordInput} onChange={e => setKeywordInput(e.target.value)} placeholder="식자재명·상품명·품목코드" />
              <button type="submit" className="rd-btn is-primary">검색</button>
              <span className="rd-hist__dates">
                <input className="rd-input" type="date" aria-label="시작일" value={from} max={to} onChange={e => setFrom(e.target.value)} />
                <span className="rd-muted">~</span>
                <input className="rd-input" type="date" aria-label="종료일" value={to} min={from} onChange={e => setTo(e.target.value)} />
              </span>
              <div className="rd-pills" role="group" aria-label="기간 빠른 선택">
                <button type="button" onClick={() => setPeriod(0)}>오늘</button>
                <button type="button" onClick={() => setPeriod(7)}>7일</button>
                <button type="button" onClick={() => setPeriod(30)}>30일</button>
                <button type="button" onClick={() => setPeriod(90)}>90일</button>
              </div>
            </form>

            {orderedSummary.length > 0 && (
              <div className="rd-hist__tiles" aria-live="polite">
                {orderedSummary.map(item => (
                  <div key={item.movement_type} className={`rd-card rd-page__tile is-${TONE[TYPE_META[item.movement_type]?.tone ?? 'neutral']}`}>
                    <span>{TYPE_META[item.movement_type]?.label ?? item.movement_type} {item.movement_count.toLocaleString('ko-KR')}건</span>
                    <strong>{signed(item.amount_sum, won(item.amount_sum))}</strong>
                    {showQty && <small>{signed(item.quantity_sum, qty(item.quantity_sum))} {item.base_unit}</small>}
                  </div>
                ))}
                <div className="rd-card rd-page__tile is-info">
                  <span>재고금액 순증감 · {total.toLocaleString('ko-KR')}건</span>
                  <strong>{signed(netAmount, won(netAmount))}</strong>
                  {!showQty && <small>여러 상품을 함께 볼 때는 수량 합계를 빼고 보여 줍니다</small>}
                </div>
              </div>
            )}

            <section className="rd-card rd-page__main">
              <div className="rd-page__list-head">
                <div className="rd-pills" role="group" aria-label="변동 구분">
                  {TYPE_TABS.map(item => (
                    <button key={item.key} type="button" className={tab === item.key ? 'is-active' : ''} aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                {(productId || ingredientId || keyword) && (
                  <div className="rd-page__tools">
                    {(productId || ingredientId) && (
                      <span className="rd-chip is-info">
                        {focusName || '선택한 상품'} 이력만 보는 중
                        <button type="button" className="rd-link" onClick={() => { setFocusName(''); setParams({ account_id: accountId }) }}>전체 보기</button>
                      </span>
                    )}
                    {keyword && (
                      <span className="rd-chip is-done">
                        검색어 {keyword}
                        <button type="button" className="rd-link" onClick={() => { setKeyword(''); setKeywordInput('') }}>지우기</button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!accountId && <p role="alert" className="rd-page__empty">거래처를 선택해주세요.</p>}
              {accountId && !ready && <p role="alert" className="rd-page__empty">조회 기간을 확인해주세요.</p>}
              {error && <p role="alert" className="rd-alert">{error}</p>}
              {loading && <p role="status" className="rd-page__empty">이력을 조회하고 있습니다.</p>}

              <div className="rd-page__scroll">
                <table className="rd-table">
                  <thead>
                    <tr>
                      <th>일시</th>
                      <th>구분</th>
                      <th>식자재 / 상품</th>
                      <th>근거</th>
                      <th className="is-num">증감</th>
                      <th className="is-num">이전 → 이후</th>
                      <th className="is-num">금액</th>
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
                          <td className="is-nowrap">{movementTime(row.movement_at)}</td>
                          <td><span className={`rd-chip is-${TONE[meta.tone]}`}>{meta.label}</span></td>
                          <td>
                            <Link to={productLink(row)} onClick={() => setFocusName(row.ingredient_name || row.product_name || '')} title="이 상품의 이력만 보기">
                              <strong>{row.ingredient_name || row.product_name || '상품정보 없음'}</strong>
                            </Link>
                            {row.product_name && row.product_name !== row.ingredient_name && <small className="rd-muted">{row.product_name}</small>}
                            {row.supplier_name && <small className="rd-muted">{row.supplier_name}</small>}
                          </td>
                          <td>
                            {reference.title}
                            {reference.detail && <small className="rd-muted">{reference.detail}</small>}
                            {row.purchase_order_id && (
                              <Link className="rd-link" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: row.purchase_order_id })}`}>
                                발주서 보기{row.requested_delivery_date ? ` (납품 ${shortDate(row.requested_delivery_date)})` : ''}
                              </Link>
                            )}
                          </td>
                          <td className={`is-num${delta > 0 ? ' rd-text-ok' : delta < 0 ? ' rd-text-red' : ''}`}>
                            <strong>{signed(delta, qty(delta))} {row.base_unit}</strong>
                          </td>
                          <td className="is-num">{qty(row.quantity_before)} → {qty(row.quantity_after)} {row.base_unit}</td>
                          <td className="is-num">
                            {row.amount_delta == null ? '-' : signed(amount, won(amount))}
                            {Number(row.unit_cost_snapshot ?? 0) > 0 && <small className="rd-muted">{Number(row.unit_cost_snapshot).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/{row.base_unit}</small>}
                          </td>
                          <td>{row.user_id || '시스템'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {ready && !loading && !error && visibleRows.length === 0 && <p className="rd-page__empty">조회된 재고 변동이 없습니다.</p>}
              </div>

              <nav className="rd-page__pager">
                <span className="rd-muted">{visibleRows.length ? `${offset + 1}-${offset + visibleRows.length}` : '0'} / {total.toLocaleString('ko-KR')}건</span>
                <button type="button" className="rd-btn is-ghost" disabled={loading || offset === 0} onClick={() => movePage(offset - PAGE_SIZE)}>이전</button>
                <button type="button" className="rd-btn is-ghost" disabled={loading || offset + visibleRows.length >= total} onClick={() => movePage(offset + PAGE_SIZE)}>다음</button>
              </nav>
            </section>
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}
