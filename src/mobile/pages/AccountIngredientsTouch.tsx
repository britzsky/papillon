import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import IngredientProductLinkModal from '../../components/IngredientProductLinkModal'
import BulkIngredientLinkModal from '../../components/BulkIngredientLinkModal'
import { getAccountInventoryList, type AccountInventoryItem } from '../../api/inventory'
import { supplierInitial, useAccountIngredients, type AccountIngredient } from '../../features/inventory/useAccountIngredients'
import { getLocationName } from '../../features/inventory/inventoryView'
import './AccountIngredientsTouch.css'

const PAGE = 48
const qty = (value?: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
type Filter = 'all' | 'missing' | 'linked'
const FILTERS: { key: Filter; label: string; icon: TouchIconName }[] = [
  { key: 'all', label: '전체', icon: 'inventory' },
  { key: 'missing', label: '상품 연결 필요', icon: 'alert' },
  { key: 'linked', label: '연결됨', icon: 'check' },
]

/**
 * 거래처 식재료(태블릿·휴대폰): 메뉴에 쓰는 식재료에 실제로 살 상품을 연결한다.
 * 연결 창·일괄 연결 창은 PC 창을 그대로 쓰고(TouchPcSkin으로 손가락 크기), 목록 로직은 useAccountIngredients(PC와 공용).
 */
export default function AccountIngredientsTouch() {
  const [params] = useSearchParams()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  return <Content key={accountId} accountId={accountId} onAccountChange={setAccountId} />
}

function Content({ accountId, onAccountChange }: { accountId: string; onAccountChange: (value: string) => void }) {
  const list = useAccountIngredients(accountId)
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)
  const [selectedId, setSelectedId] = useState('')
  const [linking, setLinking] = useState<AccountIngredient | null>(null)
  const [linkNotice, setLinkNotice] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [inventory, setInventory] = useState<AccountInventoryItem[]>([])

  useEffect(() => {
    let active = true
    if (!accountId) return
    void getAccountInventoryList(accountId).then(data => { if (active) setInventory(data) }).catch(() => { if (active) setInventory([]) })
    return () => { active = false }
  }, [accountId, list.revision])

  const searched = list.rows.filter(row => `${row.ingredient_name} ${row.category_name || ''} ${row.product_name || ''}`.toLowerCase().includes(list.keyword.trim().toLowerCase()))
  const shown = searched.filter(row => filter === 'all' ? true : filter === 'missing' ? !row.product_name : Boolean(row.product_name))
  const counts: Record<Filter, number> = { all: searched.length, missing: searched.filter(r => !r.product_name).length, linked: searched.filter(r => r.product_name).length }
  const selected = list.rows.find(row => row.ingredient_id === selectedId) || null
  const stock = useMemo(() => selected ? inventory.filter(item => item.ingredient_id === selected.ingredient_id) : [], [inventory, selected])
  // 연결 창의 '다음 미연결'은 지금 보이는 목록 순서를 따른다
  const nextUnlinked = useMemo(() => {
    if (!linking) return undefined
    const index = shown.findIndex(row => row.ingredient_id === linking.ingredient_id)
    const ordered = index < 0 ? shown : [...shown.slice(index + 1), ...shown.slice(0, index)]
    return ordered.find(row => !row.product_name && row.ingredient_id !== linking.ingredient_id)
  }, [shown, linking])

  const toolbar = <label className="t-chip ai-search">
    <TouchIcon name="search" />
    <input type="search" value={list.keyword} placeholder="식재료 · 분류 · 상품 검색" onChange={e => { list.setKeyword(e.target.value); setLimit(PAGE) }} />
  </label>

  const aside = selected
    ? <div className="ai-panel">
      <div className="ai-panel__head">
        <span className={`t-dot${selected.product_name ? '' : ' ai-dot--missing'}`}>{selected.product_name ? supplierInitial(selected.supplier_name) : '!'}</span>
        <div><h2>{selected.ingredient_name}</h2><p>{selected.category_name || '분류 없음'} · 기준 {selected.base_unit} · 메뉴 {selected.menu_usage_count}개</p></div>
        <button type="button" className="t-btn is-icon is-ghost" aria-label="닫기" onClick={() => setSelectedId('')}><TouchIcon name="close" /></button>
      </div>
      <div className="ai-panel__body">
        <div className={`ai-link ${selected.product_name ? 'is-linked' : 'is-missing'}`}>
          <span>사용 상품</span>
          <strong>{selected.product_name || '아직 연결된 상품이 없습니다'}</strong>
          {selected.supplier_name && <small>{selected.supplier_name}</small>}
        </div>
        <h3 className="ai-panel__sub">상품별 현재고 {stock.length}개</h3>
        {stock.length === 0 && <p className="ai-panel__empty">이 식재료로 들어온 재고가 없습니다.</p>}
        <ul className="ai-stock">{stock.map((item, i) => <li key={item.inventory_balance_id || i}>
          <div><strong>{item.product_name || item.ingredient_name}</strong><small>{item.supplier_name || '공급사 미등록'} · {getLocationName(item.location_id)}</small></div>
          <span>{qty(item.current_base_qty)} {item.base_unit}</span>
          {item.account_ingredient_product_id ? <Link className="t-btn is-small is-soft" to={`/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(item.account_ingredient_product_id) })}`}>이력</Link> : null}
        </li>)}</ul>
      </div>
      <div className="ai-panel__actions">
        <button type="button" className="t-btn is-primary is-large is-block" onClick={() => { setLinkNotice(''); setLinking(selected) }}>{selected.product_name ? '연결 관리' : '상품 연결'}</button>
        {!selected.product_name && <Link className="t-btn is-soft is-block" to={`/order_manager/order?${new URLSearchParams({ tab: 'products', account_id: accountId, ingredient_id: selected.ingredient_id })}`}>새 상품 찾아 주문</Link>}
      </div>
    </div>
    : <div className="ai-panel">
      <div className="ai-panel__head ai-panel__head--plain"><div><h2>상품 연결</h2><p>메뉴에 쓰는 식재료마다 실제로 살 상품을 정해 두면 발주·재고가 그 상품으로 계산됩니다.</p></div></div>
      <div className="ai-panel__body">
        <div className="ai-stats">
          <div><span>사용 식재료</span><strong>{list.rows.length}개</strong></div>
          <div className={list.missingCount ? 'is-warn' : 'is-ok'}><span>연결 필요</span><strong>{list.missingCount}개</strong></div>
        </div>
        {notice && <p className="t-msg ai-notice">{notice}</p>}
        <p className="ai-panel__empty">식재료를 누르면 연결된 상품과 재고가 여기에 나옵니다.</p>
      </div>
      <div className="ai-panel__actions">
        <button type="button" className="t-btn is-primary is-large is-block" disabled={!list.missingCount} onClick={() => { setNotice(''); setBulkOpen(true) }}>미연결 {list.missingCount}개 한 번에 연결</button>
      </div>
    </div>

  return <TouchLayout title="거래처 식재료" subtitle={accountId ? `${list.rows.length}개 · 연결 필요 ${list.missingCount}개` : undefined} toolbar={toolbar} aside={aside} onAccountChange={onAccountChange}>
    <div className="t-tabs" role="tablist" aria-label="연결 상태">
      {FILTERS.map(f => <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
        className={`t-tab${filter === f.key ? ' is-active' : ''}${f.key === 'missing' && counts.missing ? ' ai-tab--alert' : ''}`} onClick={() => { setFilter(f.key); setLimit(PAGE) }}>
        <TouchIcon name={f.icon} /><strong>{f.label}</strong><small>{counts[f.key]}개</small>
      </button>)}
    </div>

    {!accountId && <p className="t-msg">위에서 거래처를 고르면 식재료가 나옵니다.</p>}
    {list.error && <p className="t-msg is-error">{list.error}</p>}
    {accountId && list.loading && <p className="t-msg" role="status">식재료를 불러오는 중…</p>}
    {accountId && !list.loading && !list.error && shown.length === 0 && <p className="t-msg">{list.rows.length ? '조건에 맞는 식재료가 없습니다.' : '사용 식재료가 없습니다. 거래처 메뉴를 먼저 등록해주세요.'}</p>}

    <div className="ai-grid">
      {shown.slice(0, limit).map(row => <button key={row.ingredient_id} type="button" className={`t-card ai-card${row.ingredient_id === selectedId ? ' is-selected' : ''}`} onClick={() => setSelectedId(row.ingredient_id === selectedId ? '' : row.ingredient_id)}>
        <span className="ai-card__top">
          <span className={`t-dot${row.product_name ? '' : ' ai-dot--missing'}`}>{row.product_name ? supplierInitial(row.supplier_name) : '!'}</span>
          <span className="t-badge">{row.category_name || '분류 없음'}</span>
        </span>
        <strong>{row.ingredient_name}</strong>
        <small className={row.product_name ? '' : 'ai-card__missing'}>{row.product_name || '상품 연결 필요'}</small>
        <span className="ai-card__meta">메뉴 {row.menu_usage_count}개 · {row.base_unit}</span>
      </button>)}
    </div>
    {shown.length > limit && <button type="button" className="t-btn is-soft is-block ai-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({shown.length - limit}개 남음)</button>}

    {linking && <IngredientProductLinkModal key={`${accountId}/${linking.ingredient_id}`} accountId={accountId} ingredient={linking} notice={linkNotice}
      nextIngredientName={nextUnlinked?.ingredient_name}
      onClose={() => { setLinking(null); setLinkNotice('') }} onLinked={list.reload}
      onAdvance={message => {
        if (nextUnlinked) { setLinkNotice(`${message} 다음 미연결 식재료를 이어서 연결하세요.`); setLinking(nextUnlinked); setSelectedId(nextUnlinked.ingredient_id) }
        else { setLinking(null); setLinkNotice(''); setNotice(`${message} 이 목록의 미연결 식재료를 모두 확인했습니다.`) }
      }} />}
    {bulkOpen && <BulkIngredientLinkModal accountId={accountId} onClose={() => setBulkOpen(false)}
      onDone={linked => { if (linked) { setNotice(`${linked}개를 연결했습니다.`); list.reload() } }}
      onSearch={ingredient => { setBulkOpen(false); setLinking(list.rows.find(row => row.ingredient_id === ingredient.ingredient_id) ?? { ...ingredient, category_name: '', menu_usage_count: 0 }) }} />}
  </TouchLayout>
}
