import { Link } from 'react-router-dom'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import order from '../../assets/image/icons8-order-100-Photoroom.png'
import hygiene from '../../assets/image/icons8-hygiene-64-Photoroom.png'
import operation from '../../assets/image/icons8-capability-64-Photoroom.png'
import './OrderManager.css'

const orderMenus = [
  {
    key: 'welstory-order',
    title: 'Welstory 연계 발주',
    description: '사업장별 판가 조회부터 주문·입고·반품/교환까지 처리합니다.',
    icon: order,
    to: '/order_manager/welstory',
  },
  {
    key: 'food-order',
    title: '식자재 발주',
    description: '식자재 발주 대상을 확인하고 바로 주문 화면으로 이동합니다.',
    icon: order,
    to: '/order_manager/food_order',
  },
  {
    key: 'order-sheet',
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
                { label: '발주 관리' },
              ]}
            />
          }
        >

          <section className="order-manager-grid" aria-label="order management menu">
            {orderMenus.map((menu) => {
              const content = (
                <>
                  <span className="order-manager-card__icon" aria-hidden="true">
                    <img src={menu.icon} alt="" />
                  </span>
                  <strong className="order-manager-card__title">{menu.title}</strong>
                  <span className="order-manager-card__description">{menu.description}</span>
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
                  className="order-manager-card order-manager-card--disabled"
                >
                  {content}
                </button>
              )
            })}
          </section>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default OrderManager
