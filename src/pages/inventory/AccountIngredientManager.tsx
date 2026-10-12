import { getAccountInventoryList, type AccountInventoryItem } from '../../api/inventory'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import IngredientProductLinkModal from '../../components/IngredientProductLinkModal'
import BulkIngredientLinkModal from '../../components/BulkIngredientLinkModal'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import { buildApiUrl } from '../../config/api'
import '../operations/MenuManager.css'

type Ingredient = { ingredient_id: string; ingredient_name: string; base_unit: string; category_name: string; product_name?: string; supplier_name?: string; menu_usage_count: number }

function supplierInitial(name?: string) {
  const supplier = name?.trim() || ''
  if (supplier.includes('웰스토리')) return '삼'
  if (supplier.includes('아워홈')) return '아'
  return supplier.slice(0, 1) || '-'
}

export default function AccountIngredientManager() {
  const [params] = useSearchParams()
  const accountId = params.get('account_id') ?? localStorage.getItem('account_id') ?? ''
  return <AccountIngredientContent key={accountId} accountId={accountId} />
}

function AccountIngredientContent({ accountId }: { accountId: string }) {
  const [, setParams] = useSearchParams()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [rows, setRows] = useState<Ingredient[]>([])
  const [inventory, setInventory] = useState<AccountInventoryItem[]>([])
  const [inventoryError, setInventoryError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(Boolean(accountId))
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<Ingredient | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    void getAccountOptions().then(data => { if (active) setAccounts(data) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    if (!accountId) return
    void fetch(buildApiUrl(`/v2/menu-management/ingredients?${new URLSearchParams({ account_id: accountId })}`))
      .then(async response => { const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw new Error(data.message || '거래처 식자재 조회에 실패했습니다.'); return data as Ingredient[] })
      .then(data => { if (active) setRows(data) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountId, revision])
  useEffect(() => {
    let active = true
    if (!accountId) return
    void getAccountInventoryList(accountId).then(data => { if (active) { setInventory(data); setInventoryError('') } })
      .catch(e => { if (active) setInventoryError(e.message) })
    return () => { active = false }
  }, [accountId, revision])
  const filtered = useMemo(() => rows.filter(row => (!missingOnly || !row.product_name) && `${row.ingredient_name} ${row.category_name || ''} ${row.product_name || ''}`.toLowerCase().includes(keyword.trim().toLowerCase())), [rows, keyword, missingOnly])
  const pages = Math.max(1, Math.ceil(filtered.length / 20))
  const [linkNotice, setLinkNotice] = useState('')
  // 현재 화면 목록(검색·필터 적용) 순서에서 지금 식재료 다음의 미연결 식재료(끝이면 처음부터)
  const nextUnlinked = useMemo(() => {
    if (!selected) return undefined
    const index = filtered.findIndex(row => row.ingredient_id === selected.ingredient_id)
    const ordered = index < 0 ? filtered : [...filtered.slice(index + 1), ...filtered.slice(0, index)]
    return ordered.find(row => !row.product_name && row.ingredient_id !== selected.ingredient_id)
  }, [filtered, selected])
  return <div className="menu-manager-page"><main className="menu-manager-content"><SideMenuLayout header={<HeaderBar title="거래처 재고 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '재고관리' }, { label: '거래처 재고 관리' }]} />}>
    <section className="menu-manager-filters"><div className="menu-manager-filter-grid">
      <div className="menu-manager-field"><label htmlFor="ingredient-account">거래처</label><select id="ingredient-account" value={accountId} onChange={e => setParams({ account_id: e.target.value })}><option value="">거래처 선택</option>{accountId && !accounts.some(a => a.value === accountId) && <option value={accountId}>{accountId}</option>}{accounts.map(a => <option key={a.value} value={a.value}>{a.text}</option>)}</select></div>
      <div className="menu-manager-field"><label htmlFor="account-ingredient-search">검색</label><input id="account-ingredient-search" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} placeholder="식자재명, 분류, 상품명" /></div>
      <label><input type="checkbox" checked={missingOnly} onChange={e => { setMissingOnly(e.target.checked); setPage(1) }} /> 상품 연결 필요만 보기</label>
    </div></section>
    <div className="menu-manager-layout account-ingredient-layout">
    <section className="menu-manager-panel"><div className="menu-manager-panel__header"><div><h2>거래처 사용 식자재</h2><p>등록된 메뉴의 식자재에 실제 구매할 상품을 연결합니다. 같은 식자재를 사용하는 모든 메뉴에 공통 적용됩니다.</p><span>{filtered.length}건 · 상품 연결 필요 {rows.filter(r => !r.product_name).length}건</span>
        {rows.some(r => !r.product_name) && <button type="button" className="menu-manager-select-button" onClick={() => { setNotice(''); setBulkOpen(true) }}>미연결 {rows.filter(r => !r.product_name).length}건 일괄 연결</button>}
        {notice && <p role="status">{notice}</p>}</div><Link to={`/inventory/account?account_id=${encodeURIComponent(accountId)}`}>상품별 재고 조정</Link></div>
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">식자재를 불러오는 중입니다.</p> : <div className="menu-manager-table-scroll"><table className="menu-manager-table"><thead><tr><th>식자재</th><th>분류</th><th>기준단위</th><th>사용 메뉴</th><th>사용상품</th><th>공급사</th><th>상품 설정</th></tr></thead><tbody>{filtered.slice((page - 1) * 20, page * 20).map(row => <tr key={row.ingredient_id}><td>{row.product_name || row.ingredient_name}</td><td>{row.category_name}</td><td>{row.base_unit}</td><td>{row.menu_usage_count}</td><td>{row.product_name || '상품 연결 필요'}</td><td><span className="account-ingredient-supplier-badge" title={row.supplier_name?.trim() || '공급사 미등록'} aria-label={row.supplier_name?.trim() || '공급사 미등록'} tabIndex={0}>{supplierInitial(row.supplier_name)}</span></td><td><button className="menu-manager-select-button" onClick={() => setSelected(row)}>{row.product_name ? '연결 관리' : '상품 연결'}</button>{!row.product_name && <Link to={`/order_manager/product-order?${new URLSearchParams({ account_id: accountId, ingredient_id: row.ingredient_id })}`}>상품발주</Link>}</td></tr>)}</tbody></table>{!filtered.length && <p>{accountId ? '사용 식자재가 없습니다. 거래처 메뉴를 먼저 등록하거나 검색 조건을 확인해주세요.' : '거래처를 선택해주세요.'}</p>}</div>}
      <nav className="menu-manager-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>다음</button></nav>
    </section>
    <section className="menu-manager-panel"><div className="menu-manager-panel__header"><h2>상품별 현재고</h2><Link to={`/order_manager/product-order?account_id=${encodeURIComponent(accountId)}`}>새 상품 발주</Link><Link to={`/inventory/account?account_id=${encodeURIComponent(accountId)}`}>재고 수량 조정</Link></div><p>기존 상품의 남은 재고와 별도로 구매한 상품도 모두 표시합니다. 같은 식자재라도 상품·창고별 잔량을 보존합니다.</p>
      {inventoryError && <p role="alert">{inventoryError}</p>}
      <div className="menu-manager-table-scroll"><table className="menu-manager-table"><thead><tr><th>상품</th><th>공급사</th><th>상품코드</th><th>창고</th><th>현재고</th><th>이력</th></tr></thead><tbody>{inventory.filter(i => `${i.product_name || i.ingredient_name} ${i.supplier_item_code || ''}`.toLowerCase().includes(keyword.toLowerCase())).map((i, index) => <tr key={i.inventory_balance_id || index}><td>{i.product_name || i.ingredient_name}</td><td><span className="account-ingredient-supplier-badge" title={i.supplier_name?.trim() || '공급사 미등록'} aria-label={i.supplier_name?.trim() || '공급사 미등록'} tabIndex={0}>{supplierInitial(i.supplier_name)}</span></td><td>{i.supplier_item_code}</td><td>{i.location_id}</td><td>{i.current_base_qty.toLocaleString()} {i.base_unit}</td><td>{i.account_ingredient_product_id ? <Link to={`/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(i.account_ingredient_product_id) })}`}>변동 이력</Link> : '-'}</td></tr>)}</tbody></table>{!inventory.length && !inventoryError && <p>등록된 상품 재고가 없습니다. 실제 입고 후 현재고가 반영됩니다.</p>}</div>
    </section>
    </div>
  </SideMenuLayout></main>{selected && <IngredientProductLinkModal key={`${accountId}/${selected.ingredient_id}`} accountId={accountId} ingredient={selected} notice={linkNotice}
      nextIngredientName={nextUnlinked?.ingredient_name}
      onClose={() => { setSelected(null); setLinkNotice('') }} onLinked={() => { setLoading(true); setError(''); setRevision(r => r + 1) }}
      onAdvance={message => {
        // 연결이 끝나면 지금 목록 순서대로 다음 미연결 식재료를 바로 연다. 없으면 닫는다.
        if (nextUnlinked) { setLinkNotice(`${message} 다음 미연결 식재료를 이어서 연결하세요.`); setSelected(nextUnlinked) }
        else { setSelected(null); setLinkNotice(''); setNotice(`${message} 이 목록의 미연결 식재료를 모두 확인했습니다.`) }
      }} />}
    {bulkOpen && <BulkIngredientLinkModal accountId={accountId} onClose={() => setBulkOpen(false)}
      onDone={linked => { if (linked) { setNotice(`${linked}건을 연결했습니다.`); setLoading(true); setRevision(r => r + 1) } }}
      onSearch={ingredient => { setBulkOpen(false); setSelected(rows.find(row => row.ingredient_id === ingredient.ingredient_id) ?? { ...ingredient, category_name: '', menu_usage_count: 0 }) }} />}</div>
}
