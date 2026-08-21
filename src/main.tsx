import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Home from './pages/Home.tsx'
import FoodOrder from './pages/order/FoodOrder.tsx'
import AccountInventoryManager from './pages/inventory/AccountInventoryManager.tsx'
import OrderManager from './pages/order/OrderManager.tsx'
import AccountMenuManager from './pages/operations/AccountMenuManager.tsx'
import AccountManager from './pages/operations/AccountManager.tsx'
import MenuManager from './pages/operations/MenuManager.tsx'
import TableMealsManager from './pages/operations/TableMealsManager.tsx'
import Payment from './pages/Payment.tsx'
import PaymentResult from './pages/PaymentResult.tsx'
import VendorSanitation from './pages/sanitation/VendorSanitation.tsx'
import WelstoryOrder from './pages/order/WelstoryOrder.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/payment/success" element={<PaymentResult />} />
        <Route path="/payment/fail" element={<PaymentResult />} />
        <Route path="/billing/success" element={<PaymentResult />} />
        <Route path="/billing/fail" element={<PaymentResult />} />
        <Route path="/home" element={<Home />} />
        <Route path="/home/sidebar" element={<Home />} />
        <Route path="/home/sidebar/food-order" element={<FoodOrder />} />
        <Route path="/order_manager" element={<OrderManager />} />
        <Route path="/order_manager/food_order" element={<FoodOrder />} />
        <Route path="/order_manager/food_order/:menuId" element={<FoodOrder />} />
        <Route path="/order_manager/welstory" element={<WelstoryOrder />} />
        <Route path="/inventory/account" element={<AccountInventoryManager />} />
        <Route path="/operations/menu" element={<MenuManager />} />
        <Route path="/operations/account" element={<AccountManager />} />
        <Route path="/operations/account-menu" element={<AccountMenuManager />} />
        <Route path="/operations/table-meals" element={<TableMealsManager />} />
        <Route path="/sanitation/vendor" element={<VendorSanitation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
