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
import { DeviceRoute } from './mobile/deviceMode'
import OrderWorkspaceTouch from './mobile/pages/OrderWorkspaceTouch'
import HomeTouch from './mobile/pages/HomeTouch'
import TableMealsTouch from './mobile/pages/TableMealsTouch'
import InventoryTouch from './mobile/pages/InventoryTouch'
import OrdersTouch from './mobile/pages/OrdersTouch'
import HistoryTouch from './mobile/pages/HistoryTouch'
import AccountIngredientsTouch from './mobile/pages/AccountIngredientsTouch'
import IngredientMasterTouch from './mobile/pages/IngredientMasterTouch'
import SiteMappingTouch from './mobile/pages/SiteMappingTouch'
import SupplierTouch from './mobile/pages/SupplierTouch'
import AccountConfigTouch from './mobile/pages/AccountConfigTouch'
import SearchAnalyticsTouch from './mobile/pages/SearchAnalyticsTouch'

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
      <WorkspaceBoundary><Routes>
        {/* 발주 화면 통합: 예전 주소는 발주하기의 해당 탭으로 이동(쿼리 유지) */}
        <Route path="/order_manager/order" element={<DeviceRoute pc={<OrderWorkspace />} touch={<OrderWorkspaceTouch />} />} />
        <Route path="/order_manager/recommended" element={<DeviceRoute pc={<OrderWorkspace initialTab="recommended" />} touch={<OrderWorkspaceTouch initialTab="recommended" />} />} />
        <Route path="/inventory/history" element={<DeviceRoute pc={<InventoryHistory />} touch={<HistoryTouch />} />} />
        <Route path="/" element={<App />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/payment/success" element={<PaymentResult />} />
        <Route path="/payment/fail" element={<PaymentResult />} />
        <Route path="/billing/success" element={<PaymentResult />} />
        <Route path="/billing/fail" element={<PaymentResult />} />
        <Route path="/home" element={<DeviceRoute pc={<Home />} touch={<HomeTouch />} />} />
        <Route path="/search" element={<Navigate to={`/home${window.location.search}`} replace />} />
        <Route path="/home/sidebar" element={<Home />} />
        <Route path="/home/sidebar/food-order" element={<DeviceRoute pc={<OrderWorkspace initialTab="shortage" />} touch={<OrderWorkspaceTouch initialTab="shortage" />} />} />
        <Route path="/order_manager/orders" element={<DeviceRoute pc={<PurchaseOrderManager />} touch={<OrdersTouch />} />} />
        <Route path="/order_manager" element={<OrderManager />} />
        <Route path="/order_manager/product-order" element={<DeviceRoute pc={<OrderWorkspace initialTab="products" />} touch={<OrderWorkspaceTouch initialTab="products" />} />} />
        <Route path="/order_manager/food_order" element={<DeviceRoute pc={<OrderWorkspace initialTab="shortage" />} touch={<OrderWorkspaceTouch initialTab="shortage" />} />} />
        <Route path="/order_manager/food_order/:menuId" element={<DeviceRoute pc={<OrderWorkspace initialTab="shortage" />} touch={<OrderWorkspaceTouch initialTab="shortage" />} />} />
        <Route path="/order_manager/welstory" element={<WelstoryOrder />} />
        <Route path="/order_manager/suppliers" element={<DeviceRoute pc={<SupplierIntegrationDashboard />} touch={<SupplierTouch />} />} />
        <Route path="/order_manager/supplier-sites" element={<DeviceRoute pc={<SupplierSiteMapping />} touch={<SiteMappingTouch />} />} />
        <Route path="/inventory/account" element={<DeviceRoute pc={<AccountInventoryManager />} touch={<InventoryTouch />} />} />
        <Route path="/inventory/account-ingredients" element={<DeviceRoute pc={<AccountIngredientManager />} touch={<AccountIngredientsTouch />} />} />
        <Route path="/inventory/ingredients" element={<DeviceRoute pc={<IngredientMasterManager />} touch={<IngredientMasterTouch />} />} />
        <Route path="/operations/menu" element={<MenuManager />} />
        <Route path="/operations/account" element={<DeviceRoute pc={<AccountManager />} touch={<AccountConfigTouch />} />} />
        <Route path="/operations/account-menu" element={<AccountMenuManager />} />
        <Route path="/operations/table-meals" element={<DeviceRoute pc={<TableMealsManager />} touch={<TableMealsTouch />} />} />
        <Route path="/operations/search-analytics" element={<DeviceRoute pc={<SearchAnalytics />} touch={<SearchAnalyticsTouch />} />} />
        <Route path="/sanitation/vendor" element={<VendorSanitation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></WorkspaceBoundary>
    </BrowserRouter>
  </StrictMode>,
)
