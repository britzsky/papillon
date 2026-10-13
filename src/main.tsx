import WorkspaceBoundary from './components/WorkspaceBoundary'
import OrderWorkspace from './pages/order/OrderWorkspace'
import InventoryHistory from './pages/inventory/InventoryHistory'
import { installWorkspaceSession } from './api/workspaceSession'
import { installRequestLoading } from './api/requestLoading'
import GlobalLoading from './components/GlobalLoading'
import PurchaseOrderManager from './pages/order/PurchaseOrderManager'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Home from './pages/Home.tsx'
import AccountInventoryManager from './pages/inventory/AccountInventoryManager.tsx'
import AccountIngredientManager from './pages/inventory/AccountIngredientManager.tsx'
import IngredientMasterManager from './pages/inventory/IngredientMasterManager.tsx'
import OrderManager from './pages/order/OrderManager.tsx'
import AccountMenuManager from './pages/operations/AccountMenuManager.tsx'
import AccountManager from './pages/operations/AccountManager.tsx'
import MenuManager from './pages/operations/MenuManager.tsx'
import TableMealsManager from './pages/operations/TableMealsManager.tsx'
import Payment from './pages/Payment.tsx'
import PaymentResult from './pages/PaymentResult.tsx'
import VendorSanitation from './pages/sanitation/VendorSanitation.tsx'
import WelstoryOrder from './pages/order/WelstoryOrder.tsx'
import SupplierIntegrationDashboard from './pages/order/SupplierIntegrationDashboard.tsx'
import SupplierSiteMapping from './pages/order/SupplierSiteMapping.tsx'
import SearchAnalytics from './pages/operations/SearchAnalytics.tsx'
import MobileModeSwitch from './mobile/MobileModeSwitch'
import MobileTableMeals from './mobile/pages/MobileTableMeals'

import './styles/WorkspaceTheme.css'
import './styles/UserTypography.css'
import './styles/QueryAndTableLayout.css'
import './styles/ResponsiveWorkspace.css'
import './styles/ControlSizing.css'
import './styles/ProcurementRefresh.css'
import './styles/Readability.css'

installWorkspaceSession()
// 모든 화면의 조회·저장 요청에 로딩 표시(세션 래퍼 다음에 설치해 전체 요청 시간을 잰다)
installRequestLoading()
document.body.classList.add('workspace-ui')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalLoading />
      <MobileModeSwitch />
      <WorkspaceBoundary><Routes>
        {/* 발주 화면 통합: 예전 주소는 발주하기의 해당 탭으로 이동(쿼리 유지) */}
        <Route path="/order_manager/order" element={<OrderWorkspace />} />
        <Route path="/order_manager/recommended" element={<OrderWorkspace initialTab="recommended" />} />
        <Route path="/inventory/history" element={<InventoryHistory />} />
        <Route path="/" element={<App />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/payment/success" element={<PaymentResult />} />
        <Route path="/payment/fail" element={<PaymentResult />} />
        <Route path="/billing/success" element={<PaymentResult />} />
        <Route path="/billing/fail" element={<PaymentResult />} />
        <Route path="/home" element={<Home />} />
        <Route path="/search" element={<Navigate to={`/home${window.location.search}`} replace />} />
        <Route path="/home/sidebar" element={<Home />} />
        <Route path="/home/sidebar/food-order" element={<OrderWorkspace initialTab="shortage" />} />
        <Route path="/order_manager/orders" element={<PurchaseOrderManager />} />
        <Route path="/order_manager" element={<OrderManager />} />
        <Route path="/order_manager/product-order" element={<OrderWorkspace initialTab="products" />} />
        <Route path="/order_manager/food_order" element={<OrderWorkspace initialTab="shortage" />} />
        <Route path="/order_manager/food_order/:menuId" element={<OrderWorkspace initialTab="shortage" />} />
        <Route path="/order_manager/welstory" element={<WelstoryOrder />} />
        <Route path="/order_manager/suppliers" element={<SupplierIntegrationDashboard />} />
        <Route path="/order_manager/supplier-sites" element={<SupplierSiteMapping />} />
        <Route path="/inventory/account" element={<AccountInventoryManager />} />
        <Route path="/inventory/account-ingredients" element={<AccountIngredientManager />} />
        <Route path="/inventory/ingredients" element={<IngredientMasterManager />} />
        <Route path="/operations/menu" element={<MenuManager />} />
        <Route path="/operations/account" element={<AccountManager />} />
        <Route path="/operations/account-menu" element={<AccountMenuManager />} />
        <Route path="/operations/table-meals" element={<TableMealsManager />} />
        <Route path="/operations/search-analytics" element={<SearchAnalytics />} />
        {/* 모바일·태블릿 화면(src/mobile). 터치 기기는 MobileModeSwitch가 PC 주소에서 이리로 보낸다 */}
        <Route path="/m" element={<Navigate to="/m/table-meals" replace />} />
        <Route path="/m/table-meals" element={<MobileTableMeals />} />
        <Route path="/sanitation/vendor" element={<VendorSanitation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></WorkspaceBoundary>
    </BrowserRouter>
  </StrictMode>,
)
