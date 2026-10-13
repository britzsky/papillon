import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import type { InventoryMovement } from '../../api/inventory'
import {
  HISTORY_PAGE_SIZE as PAGE_SIZE, TYPE_META, TYPE_TABS, historyQty as qty, historyWon as won, movementTime, referenceText, shortDate, signed, useInventoryHistory,
} from '../../features/inventory/useInventoryHistory'
import '../operations/MenuManager.css'
import './InventoryHistory.css'

/** 재고 변동 이력(PC). 조회 로직은 features/inventory/useInventoryHistory(터치 화면과 공용). */
export default function InventoryHistory() {
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account_id') || localStorage.getItem('account_id') || ''
  const productId = params.get('account_ingredient_product_id') || ''
  const ingredientId = params.get('ingredient_id') || ''

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const {
    from, setFrom, to, setTo, keyword, setKeyword, tab, setTab, focusName, setFocusName, setPeriod,
    ready, loading, error, rows: visibleRows, offset, movePage, total, netAmount, showQty, orderedSummary,
  } = useInventoryHistory(accountId, productId, ingredientId)

  useEffect(() => {
    let active = true
    void getAccountOptions().then(data => { if (active) setAccounts(data) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const productLink = (row: InventoryMovement) =>
    `/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(row.account_ingredient_product_id) })}`
  const submitKeyword = (event: FormEvent) => { event.preventDefault(); setKeyword(keywordInput.trim()) }

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
