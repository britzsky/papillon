import { Link } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import order from '../../assets/image/icons8-order-100-Photoroom.png'
import hygiene from '../../assets/image/icons8-hygiene-64-Photoroom.png'
import operation from '../../assets/image/icons8-capability-64-Photoroom.png'
import './OrderManager.css'

const orderMenus = [
  {
    key: 'supplier-integration',
    title: '공급사 통합 연동',
    description: '웰스토리·아워홈과 향후 공급사의 사업장, 상품, 판가, 동기화 상태를 통합 조회합니다.',
    icon: operation,
    to: '/order_manager/suppliers',
  },
  {
    key: 'order',
    title: '발주하기',
    description: '추천 발주안·부족 식자재·상품 검색을 한 화면에서 고르고 웰스토리·아워홈에 함께 발주합니다.',
    icon: order,
    to: '/order_manager/order',
  },
  {
    key: 'order-sheet',
    to: '/order_manager/orders',
    title: '발주서 관리',
    description: '작성된 발주서를 확인하고 진행 상태를 관리합니다.',
    icon: hygiene,
  },
  {
    key: 'statement',
    title: '거래명세서 관리',
    description: '업체별 거래명세서 이력을 조회할 수 있습니다.',
    icon: operation,
  },
]

function OrderManager() {
  return (
    <div className="order-manager-page">
      <main className="order-manager-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="발주 관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '발주관리' },
              ]}
            />
          }
        >

          <div className="rd rd-page rd-om">
          <header className="rd-page__head">
            <div>
              <h1 className="rd-h1">발주 관리</h1>
              <p className="rd-muted">발주·발주서·공급사 연동 화면으로 이동합니다.</p>
            </div>
            <DeadlineAlertSlot />
          </header>
          <section className="order-manager-grid" aria-label="발주 관리 메뉴">
            {orderMenus.map((menu) => {
              const content = (
                <>
                  <span className="order-manager-card__icon" aria-hidden="true">
                    <img src={menu.icon} alt="" />
                  </span>
                  <strong className="order-manager-card__title">{menu.title}</strong>
                  <span className="order-manager-card__description">{menu.description}</span>
                  {menu.to ? null : <span className="rd-chip is-done">준비 중</span>}
                </>
              )

              if (menu.to) {
                return (
                  <Link key={menu.key} to={menu.to} className="order-manager-card">
                    {content}
                  </Link>
                )
              }

              return (
                <button
                  key={menu.key}
                  type="button"
                  className="order-manager-card order-manager-card--disabled" disabled
                >
                  {content}
                </button>
              )
            })}
          </section>
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default OrderManager
