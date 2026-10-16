import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { getAccountInventoryList, type AccountInventoryItem } from '../../api/inventory'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import IngredientProductLinkModal from '../../components/IngredientProductLinkModal'
import BulkIngredientLinkModal from '../../components/BulkIngredientLinkModal'
import { supplierInitial, useAccountIngredients, type AccountIngredient as Ingredient } from '../../features/inventory/useAccountIngredients'
import '../operations/MenuManager.css'

export default function AccountIngredientManager() {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  return <AccountIngredientContent key={accountId} accountId={accountId} />
}

function AccountIngredientContent({ accountId }: { accountId: string }) {
  const [inventory, setInventory] = useState<AccountInventoryItem[]>([])
  const [inventoryError, setInventoryError] = useState('')
  const [page, setPage] = useState(1)
  const { rows, filtered, loading, error, keyword, setKeyword, missingOnly, setMissingOnly, nextUnlinked: findNextUnlinked, reload, revision } = useAccountIngredients(accountId)
  const [selected, setSelected] = useState<Ingredient | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    if (!accountId) return
    void getAccountInventoryList(accountId).then(data => { if (active) { setInventory(data); setInventoryError('') } })
      .catch(e => { if (active) setInventoryError(e.message) })
    return () => { active = false }
  }, [accountId, revision])
  const pages = Math.max(1, Math.ceil(filtered.length / 20))
  const [linkNotice, setLinkNotice] = useState('')
  // 현재 화면 목록(검색·필터 적용) 순서에서 지금 식재료 다음의 미연결 식재료(끝이면 처음부터)
  const nextUnlinked = findNextUnlinked(selected)
  const unlinkedCount = rows.filter(r => !r.product_name).length
  const visibleInventory = inventory.filter(i => `${i.product_name || i.ingredient_name} ${i.supplier_item_code || ''}`.toLowerCase().includes(keyword.toLowerCase()))
  const accountQuery = encodeURIComponent(accountId)
  return <div className="menu-manager-page"><main className="menu-manager-content"><SideMenuLayout header={<HeaderBar title="거래처 재고 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '거래처 재고 관리' }]} />}>
    <div className="rd rd-page rd-ing">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-h1">거래처 재고 관리</h1>
          <p className="rd-muted">거래처 메뉴에 쓰는 식자재마다 실제로 살 상품을 연결합니다. 같은 식자재를 쓰는 모든 메뉴에 함께 적용됩니다.</p>
        </div>
        <DeadlineAlertSlot />
        <div className="rd-page__actions">
          {unlinkedCount > 0 && <button type="button" className="rd-btn is-primary" onClick={() => { setNotice(''); setBulkOpen(true) }}>미연결 {unlinkedCount}건 일괄 연결</button>}
          <Link className="rd-btn" to={`/inventory/account?account_id=${accountQuery}`}>재고 수량 조정</Link>
          <Link className="rd-btn" to={`/order_manager/product-order?account_id=${accountQuery}`}>새 상품 발주</Link>
        </div>
      </header>

      <div className="rd-page__tiles">
        <button type="button" className={`rd-card rd-page__tile${!missingOnly ? ' is-active' : ''}`} onClick={() => { setMissingOnly(false); setPage(1) }}><span>사용 식자재</span><strong>{rows.length.toLocaleString('ko-KR')}</strong><small>거래처 메뉴 레시피 기준</small></button>
        <button type="button" className={`rd-card rd-page__tile${unlinkedCount > 0 ? ' is-urgent' : ' is-ok'}${missingOnly ? ' is-active' : ''}`} onClick={() => { setMissingOnly(true); setPage(1) }}><span>상품 연결 필요</span><strong>{unlinkedCount.toLocaleString('ko-KR')}</strong><small>연결해야 발주·재고 계산</small></button>
        <div className="rd-card rd-page__tile is-ok"><span>상품 연결 완료</span><strong>{(rows.length - unlinkedCount).toLocaleString('ko-KR')}</strong><small>{rows.length ? `${Math.round((rows.length - unlinkedCount) / rows.length * 100)}%` : '-'}</small></div>
        <div className="rd-card rd-page__tile is-info"><span>재고 있는 상품</span><strong>{inventory.length.toLocaleString('ko-KR')}</strong><small>상품·창고별 잔량</small></div>
      </div>

      <section className="rd-card rd-page__filters">
        <input className="rd-input" type="search" aria-label="검색" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} placeholder="식자재명·분류·상품명" />
        <label className="rd-check"><input type="checkbox" checked={missingOnly} onChange={e => { setMissingOnly(e.target.checked); setPage(1) }} /> 상품 연결 필요만 보기</label>
      </section>
      {notice && <p className="rd-page__notice is-ok" role="status">{notice}</p>}
      {error && <p className="rd-alert" role="alert">{error}</p>}

      <div className="rd-page__grid">
        <section className="rd-card rd-page__main">
          <div className="rd-page__list-head"><div><h2 className="rd-h2">거래처 사용 식자재</h2><p className="rd-muted">{filtered.length}건 표시</p></div></div>
          {loading ? <p className="rd-page__empty" role="status">식자재를 불러오는 중입니다.</p> : <div className="rd-page__scroll"><table className="rd-table"><thead><tr><th>식자재</th><th>분류</th><th>기준단위</th><th className="is-num">사용 메뉴</th><th>사용상품</th><th>공급사</th><th /></tr></thead><tbody>{filtered.slice((page - 1) * 20, page * 20).map(row => <tr key={row.ingredient_id}>
            <td><strong>{row.ingredient_name}</strong></td>
            <td>{row.category_name || '-'}</td>
            <td>{row.base_unit}</td>
            <td className="is-num">{row.menu_usage_count}</td>
            <td>{row.product_name ? row.product_name : <span className="rd-chip is-urgent">상품 연결 필요</span>}</td>
            <td><span className="account-ingredient-supplier-badge" title={row.supplier_name?.trim() || '공급사 미등록'} aria-label={row.supplier_name?.trim() || '공급사 미등록'} tabIndex={0}>{supplierInitial(row.supplier_name)}</span></td>
            <td><span className="rd-page__tools"><button type="button" className={`rd-btn${row.product_name ? '' : ' is-primary'}`} onClick={() => setSelected(row)}>{row.product_name ? '연결 관리' : '상품 연결'}</button>{!row.product_name && <Link className="rd-link" to={`/order_manager/product-order?${new URLSearchParams({ account_id: accountId, ingredient_id: row.ingredient_id })}`}>상품발주</Link>}</span></td>
          </tr>)}</tbody></table>{!filtered.length && <p className="rd-page__empty">{accountId ? '사용 식자재가 없습니다. 거래처 메뉴를 먼저 등록하거나 검색 조건을 확인해주세요.' : '거래처를 선택해주세요.'}</p>}</div>}
          <nav className="rd-page__pager"><span className="rd-muted">{page} / {pages}</span><button type="button" className="rd-btn is-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button><button type="button" className="rd-btn is-ghost" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>다음</button></nav>
        </section>
        <section className="rd-card rd-page__main rd-ing__stock">
          <div className="rd-page__list-head"><div><h2 className="rd-h2">상품별 현재고</h2><p className="rd-muted">같은 식자재라도 상품·창고별 잔량을 따로 보여 줍니다.</p></div></div>
          {inventoryError && <p className="rd-alert" role="alert">{inventoryError}</p>}
          <div className="rd-page__scroll"><table className="rd-table"><thead><tr><th>상품</th><th>공급사</th><th>창고</th><th className="is-num">현재고</th><th /></tr></thead><tbody>{visibleInventory.map((i, index) => <tr key={i.inventory_balance_id || index}>
            <td><strong>{i.product_name || i.ingredient_name}</strong>{i.supplier_item_code ? <small className="rd-muted">{i.supplier_item_code}</small> : null}</td>
            <td><span className="account-ingredient-supplier-badge" title={i.supplier_name?.trim() || '공급사 미등록'} aria-label={i.supplier_name?.trim() || '공급사 미등록'} tabIndex={0}>{supplierInitial(i.supplier_name)}</span></td>
            <td>{i.location_id}</td>
            <td className="is-num"><strong>{i.current_base_qty.toLocaleString()}</strong> {i.base_unit}</td>
            <td>{i.account_ingredient_product_id ? <Link className="rd-link" to={`/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(i.account_ingredient_product_id) })}`}>이력</Link> : '-'}</td>
          </tr>)}</tbody></table>{!inventory.length && !inventoryError && <p className="rd-page__empty">등록된 상품 재고가 없습니다. 실제 입고 후 현재고가 반영됩니다.</p>}</div>
        </section>
      </div>
    </div>
  </SideMenuLayout></main>
{selected && <IngredientProductLinkModal key={`${accountId}/${selected.ingredient_id}`} accountId={accountId} ingredient={selected} notice={linkNotice}
      nextIngredientName={nextUnlinked?.ingredient_name}
      onClose={() => { setSelected(null); setLinkNotice('') }} onLinked={reload}
      onAdvance={message => {
        // 연결이 끝나면 지금 목록 순서대로 다음 미연결 식재료를 바로 연다. 없으면 닫는다.
        if (nextUnlinked) { setLinkNotice(`${message} 다음 미연결 식재료를 이어서 연결하세요.`); setSelected(nextUnlinked) }
        else { setSelected(null); setLinkNotice(''); setNotice(`${message} 이 목록의 미연결 식재료를 모두 확인했습니다.`) }
      }} />}
    {bulkOpen && <BulkIngredientLinkModal accountId={accountId} onClose={() => setBulkOpen(false)}
      onDone={linked => { if (linked) { setNotice(`${linked}건을 연결했습니다.`); reload() } }}
      onSearch={ingredient => { setBulkOpen(false); setSelected(rows.find(row => row.ingredient_id === ingredient.ingredient_id) ?? { ...ingredient, category_name: '', menu_usage_count: 0 }) }} />}</div>
}
