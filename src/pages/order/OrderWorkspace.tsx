import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import QuickOrder from './QuickOrder'
import FoodOrder from './FoodOrder'
import ProductOrder from './ProductOrder'
import './OrderWorkspace.css'

export type OrderTab = 'recommended' | 'plan' | 'stock' | 'usage' | 'products'
/** 예전 '부족 식자재' 탭. 주소·링크 호환용으로만 받아 source에 맞는 기준 탭으로 바꾼다. */
type LegacyTab = 'shortage'

// 부족량 기준 세 가지를 따로 탭으로 둔다(예전 '부족 식자재' 탭 안의 기준 버튼을 한 줄로 합침).
const TABS: { key: OrderTab; label: string; hint: string }[] = [
  { key: 'recommended', label: '추천 발주안', hint: '납품일 하루치 식단(또는 최근 사용량) 부족분을 기존 사용상품으로 미리 골라 둔 발주안' },
  { key: 'plan', label: '식단표 기준 부족량', hint: '저장된 식단의 필요량 + 안전재고 − 현재고 − 입고예정으로 계산' },
  { key: 'stock', label: '현재 부족 재고 바로 주문', hint: '현재고가 없거나 안전재고보다 적은 식자재를 바로 주문' },
  { key: 'usage', label: '최근 사용량 기준 부족 예상', hint: '최근 평균 사용량 × 확보일수 + 안전재고로 앞으로 부족할 식자재' },
  { key: 'products', label: '상품 검색', hint: '새 상품·미연결 식자재를 직접 찾아 장바구니로 발주' },
]
const SOURCE = { plan: 'PLAN', stock: 'STOCK', usage: 'INVENTORY' } as const

function isTab(value: string | null): value is OrderTab {
  return TABS.some(item => item.key === value)
}

/** 예전 부족 식자재 주소는 source(PLAN·DRAFT·STOCK·INVENTORY)나 식단표 지정 여부로 기준 탭을 고른다. */
function sourceTab(params: URLSearchParams): OrderTab {
  const source = params.get('source')
  if (source === 'PLAN' || source === 'DRAFT' || params.get('draft_key') || (!source && params.get('table_id'))) return 'plan'
  if (source === 'STOCK') return 'stock'
  return 'usage'
}

/**
 * 발주하기: 추천 발주안·부족량 기준 세 가지·상품 검색을 한 줄 탭으로 묶는다. 모든 탭이 같은 혼합 발주 경로를 쓴다.
 * 예전 주소(/order_manager/recommended, /food_order, /product-order)는 initialTab으로 들어와 쿼리를 유지한 채 이 주소로 바뀐다.
 */
export default function OrderWorkspace({ initialTab }: { initialTab?: OrderTab | LegacyTab }) {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryTab = params.get('tab')
  const legacy = queryTab === 'shortage' || (!isTab(queryTab) && initialTab === 'shortage')
  const tab: OrderTab = isTab(queryTab) ? queryTab : legacy ? sourceTab(params) : (initialTab as OrderTab | undefined) ?? 'recommended'

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
