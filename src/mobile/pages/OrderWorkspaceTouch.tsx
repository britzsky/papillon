import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ORDER_TABS, ORDER_TAB_SOURCE, resolveOrderTab, type LegacyOrderTab, type OrderTab } from '../../features/order/orderTabs'
import { RecommendedOrder } from './OrderTouch'
import ShortageOrderTouch from './ShortageOrderTouch'
import ProductOrderTouch from './ProductOrderTouch'

/**
 * 발주하기(태블릿·휴대폰): 맨 위 방법 전환(추천 발주안·식단 기준·현재 부족·사용량 예상·상품 검색) + 방법별 터치 화면.
 * 탭 규칙(예전 주소 호환 포함)은 PC OrderWorkspace와 같은 resolveOrderTab. 예전 주소는 /order_manager/order?tab=… 로 바꾼다.
 */
export default function OrderWorkspaceTouch({ initialTab }: { initialTab?: OrderTab | LegacyOrderTab }) {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { tab, queryTab, legacy } = resolveOrderTab(params, initialTab)

  useEffect(() => {
    if (location.pathname === '/order_manager/order' && (queryTab === tab || (!queryTab && !legacy))) return
    const next = new URLSearchParams(params)
    next.set('tab', tab)
    navigate(`/order_manager/order?${next}`, { replace: true })
  }, [location.pathname, params, tab, queryTab, legacy, navigate])

  const select = (next: OrderTab) => {
    if (next === tab) return
    // 거래처만 유지하고 탭별 조건(source, ingredient_id 등)은 넘기지 않는다
    const query = new URLSearchParams({ tab: next })
    const account = params.get('account_id') || localStorage.getItem('account_id')
    if (account) query.set('account_id', account)
    navigate(`/order_manager/order?${query}`)
  }

  const methodBar = <div className="t-segment t-method" role="tablist" aria-label="발주 방법">
    {ORDER_TABS.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''}
      title={item.hint} onClick={() => select(item.key)}>{item.short}</button>)}
  </div>

  if (tab === 'recommended') return <RecommendedOrder methodBar={methodBar} />
  if (tab === 'products') return <ProductOrderTouch key="products" methodBar={methodBar} />
  if (tab === 'myProducts') return <ProductOrderTouch key="my" methodBar={methodBar} favorites />
  return <ShortageOrderTouch key={tab} methodBar={methodBar} fixedSource={ORDER_TAB_SOURCE[tab]} title={ORDER_TABS.find(item => item.key === tab)!.label} />
}
