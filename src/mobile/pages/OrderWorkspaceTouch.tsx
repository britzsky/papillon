import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ORDER_TABS, ORDER_TAB_SOURCE, resolveOrderTab, type LegacyOrderTab, type OrderTab } from '../../features/order/orderTabs'
import ShortageOrderTouch from './ShortageOrderTouch'
import ProductOrderTouch from './ProductOrderTouch'
import TouchLayout from '../TouchLayout'
import WorkflowBar from '../../components/WorkflowBar'
import { OrderWorkspaceBody } from '../../pages/order/OrderWorkspace'
import '../../pages/order/OrderWorkspace.css'
import '../../pages/order/OrderPos.css'


/** 태블릿(700px 이상) 여부 — 화면을 열 때 한 번만(deviceMode와 같은 원칙) */
const IS_TABLET = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 700px)').matches)

/**
 * 태블릿 발주하기(2026-11-23 사용자 결정: 태블릿 = 브라우저 디자인): 위 메뉴는 태블릿 틀(TouchLayout), 본문은 PC 발주하기와 같은 부품(OrderWorkspaceBody).
 * 한 곳만 고치면 PC·태블릿이 같이 바뀐다. 휴대폰(700px 미만)은 아래 터치 화면 그대로.
 */
function TabletOrderWorkspace({ initialTab }: { initialTab?: OrderTab | LegacyOrderTab }) {
  return <TouchLayout title="발주하기" pcContent>
    <WorkflowBar />
    <div className="order-workspace t-order-pc"><OrderWorkspaceBody initialTab={initialTab} /></div>
  </TouchLayout>
}

/**
 * 발주하기(태블릿·휴대폰): 맨 위 방법 전환(추천 발주안·식단 기준·현재 부족·사용량 예상·상품 검색) + 방법별 터치 화면.
 * 탭 규칙(예전 주소 호환 포함)은 PC OrderWorkspace와 같은 resolveOrderTab. 예전 주소는 /order_manager/order?tab=… 로 바꾼다.
 */
export default function OrderWorkspaceTouch({ initialTab }: { initialTab?: OrderTab | LegacyOrderTab }) {
  return IS_TABLET ? <TabletOrderWorkspace initialTab={initialTab} /> : <PhoneOrderWorkspace initialTab={initialTab} />
}

function PhoneOrderWorkspace({ initialTab }: { initialTab?: OrderTab | LegacyOrderTab }) {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  // 2026-11-23 사용자 시안: 태블릿도 처음엔 '식단표 기준'(PC와 같게, 예전 터치 기본은 추천 발주안)
  const { tab, queryTab, legacy } = resolveOrderTab(params, initialTab, 'plan')
  const [moreOpen, setMoreOpen] = useState(false)

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

  // 시안: 탭은 식단표 기준 · 추천 발주안 · 나만의 식재료 세 개. 나머지(현재 부족·사용량 예상·나만의 메뉴·상품 검색)는 '더보기'에 — 기능은 그대로
  const PRIMARY: { key: OrderTab; label: string }[] = [{ key: 'plan', label: '식단표 기준' }, { key: 'recommended', label: '추천 발주안' }, { key: 'myProducts', label: '나만의 식재료' }]
  const others = ORDER_TABS.filter(item => !PRIMARY.some(p => p.key === item.key))
  const currentOther = others.find(item => item.key === tab)
  const methodBar = <div className="t-segment t-method" role="tablist" aria-label="발주 방법">
    {PRIMARY.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''}
      title={ORDER_TABS.find(t => t.key === item.key)?.hint} onClick={() => select(item.key)}>{item.label}</button>)}
    {currentOther && <button type="button" role="tab" aria-selected className="is-active" title={currentOther.hint}>{currentOther.short}</button>}
    <span className="t-method__more">
      <button type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}>더보기 ▾</button>
      {moreOpen && <span className="t-method__menu" role="menu">
        {others.map(item => <button key={item.key} type="button" role="menuitem" className={tab === item.key ? 'is-active' : ''} title={item.hint}
          onClick={() => { setMoreOpen(false); select(item.key) }}>{item.label}</button>)}
      </span>}
    </span>
  </div>

  // 추천 발주안 = 식단표 기준 화면 + 늘 쓰는 상품 미리 선택(PC와 같음, 2026-11-23)
  if (tab === 'recommended') return <ShortageOrderTouch key="recommended" methodBar={methodBar} fixedSource="PLAN" title="추천 발주안" recommended />
  if (tab === 'products') return <ProductOrderTouch key="products" methodBar={methodBar} />
  if (tab === 'myProducts') return <ProductOrderTouch key="my" methodBar={methodBar} favorites />
  return <ShortageOrderTouch key={tab} methodBar={methodBar} fixedSource={ORDER_TAB_SOURCE[tab]} title={ORDER_TABS.find(item => item.key === tab)!.label} />
}
