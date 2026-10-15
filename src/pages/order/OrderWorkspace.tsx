import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
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
  const { tab, queryTab, legacy } = resolveOrderTab(params, initialTab)

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

  return <div className="order-workspace"><SideMenuLayout header={<HeaderBar title="발주하기" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: '발주하기' }]} />}>
    <nav className="order-workspace__tabs" role="tablist" aria-label="발주 방법">
      {TABS.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''}
        title={item.hint} onClick={() => select(item.key)}>{item.label}</button>)}
    </nav>
    {/* 부족량 기준 탭은 표 위 안내 문단 하나에 설명을 합쳐 표를 최대한 위로 올린다 */}
    {!(tab in SOURCE) && <p className="order-workspace__hint">{TABS.find(item => item.key === tab)?.hint}. 어느 탭에서 발주해도 발주서·입고·재고·상품 연결이 같게 처리됩니다.</p>}
    <div role="tabpanel" aria-label={TABS.find(item => item.key === tab)?.label}>
      {tab === 'recommended' ? <QuickOrder embedded /> : tab === 'products' ? <ProductOrder embedded /> : <FoodOrder key={tab} embedded fixedSource={SOURCE[tab]} />}
    </div>
  </SideMenuLayout></div>
}
