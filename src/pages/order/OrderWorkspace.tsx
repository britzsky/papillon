import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import QuickOrder from './QuickOrder'
import FoodOrder from './FoodOrder'
import ProductOrder from './ProductOrder'
import { ORDER_TABS as TABS, ORDER_TAB_SOURCE as SOURCE, resolveOrderTab, type LegacyOrderTab as LegacyTab, type OrderTab } from '../../features/order/orderTabs'
import './OrderWorkspace.css'
import './OrderPos.css'

export type { OrderTab } from '../../features/order/orderTabs'

/**
 * 발주하기: 추천 발주안·부족량 기준 세 가지·상품 검색을 한 줄 탭으로 묶는다. 모든 탭이 같은 혼합 발주 경로를 쓴다.
 * 예전 주소(/order_manager/recommended, /food_order, /product-order)는 initialTab으로 들어와 쿼리를 유지한 채 이 주소로 바뀐다.
 */
export default function OrderWorkspace({ initialTab }: { initialTab?: OrderTab | LegacyTab }) {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { tab, queryTab, legacy } = resolveOrderTab(params, initialTab, 'plan')

  useEffect(() => {
    if (location.pathname === '/order_manager/order' && queryTab === tab) return
    if (location.pathname === '/order_manager/order' && !queryTab && !legacy) return
    const next = new URLSearchParams(params)
    next.set('tab', tab)
    navigate(`/order_manager/order?${next}`, { replace: true })
  }, [location.pathname, params, tab, queryTab, legacy, navigate])

  const select = (next: OrderTab) => {
    if (next === tab) return
    // 거래처만 유지하고 탭별 조건(source, ingredient_id 등)은 넘기지 않는다
    const query = new URLSearchParams({ tab: next })
    const account = params.get('account_id')
    if (account) query.set('account_id', account)
    navigate(`/order_manager/order?${query}`)
  }

  const [search, setSearch] = useState(() => params.get('q') || '')
  const go = (next: OrderTab, extra?: Record<string, string>) => {
    const query = new URLSearchParams({ tab: next, ...extra })
    const account = params.get('account_id')
    if (account) query.set('account_id', account)
    navigate(`/order_manager/order?${query}`)
  }
  // 무엇을 기준으로 시킬지 = 이 화면에서 가장 먼저 고르는 것. 추천 발주안도 같은 줄의 한 칸(2026-10-16 정리)
  const BASIS: { key: OrderTab; label: string }[] = [{ key: 'plan', label: '식단표 기준' }, { key: 'stock', label: '지금 부족한 재고' }, { key: 'usage', label: '최근 사용량' }, { key: 'recommended', label: '추천 발주안' }, { key: 'myProducts', label: '♥ 나만의 식재료' }]

  return <div className="order-workspace"><SideMenuLayout header={<HeaderBar title="발주하기" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주관리', to: '/order_manager' }, { label: '발주하기' }]} />}>
    {/* 2026-10-16 정리: 한 줄에 ① 기준(식단표·재고·사용량·추천 발주안) ② 마감 알림 ③ 상품 직접 검색. 화면 이름은 위 경로 줄 */}
    <header className="rd rd-order__head">
      <h1 className="rd-sr-only">발주하기</h1>
      <div role="tablist" aria-label="무엇을 기준으로 시킬까요" className="rd-seg">
        {BASIS.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''}
          title={TABS.find(t => t.key === item.key)?.hint} onClick={() => select(item.key)}>{item.label}</button>)}
      </div>
      <DeadlineAlertSlot />
      <div className="rd-order__head-right">
        <form className="rd-order__search" role="search" onSubmit={event => { event.preventDefault(); go('products', search.trim() ? { q: search.trim() } : undefined) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#5B6660" strokeWidth="2" fill="none" /><path d="M16 16 L21 21" stroke="#5B6660" strokeWidth="2" strokeLinecap="round" /></svg>
          <input type="search" className="rd-bare-input" aria-label="상품 직접 검색" placeholder="다른 상품 직접 찾아 담기" value={search} onChange={e => setSearch(e.target.value)} />
          <button type="submit" className={`rd-btn${tab === 'products' ? ' is-selected' : ''}`}>검색</button>
        </form>
      </div>
    </header>
    <div role="tabpanel" aria-label={TABS.find(item => item.key === tab)?.label}>
      {tab === 'recommended' ? <QuickOrder embedded /> : tab === 'products' ? <ProductOrder embedded /> : tab === 'myProducts' ? <ProductOrder key="my" embedded favorites /> : <FoodOrder key={tab} embedded fixedSource={SOURCE[tab]} />}
    </div>
  </SideMenuLayout></div>
}
