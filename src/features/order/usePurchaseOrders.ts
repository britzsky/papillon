import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import type { PreferenceChange } from '../../api/mixedProcurement'
import { getSupplierSites } from '../../api/supplierIntegration'
import { newRequestKey } from '../../utils/requestKey'

export type OrderItem = { unit_price_snapshot?: number; line_amount?: number; source_ingredient_id?: string; ingredient_link_status?: string; supplier_item_code?: string; client_ord_item: string; product_name: string; order_qty: number; received_order_qty: number; order_unit: string; item_status: string; supplier_result_code?: string; supplier_error_message?: string }
export type PurchaseOrder = { supplier_id?: number | string; sold_to?: string; site_name?: string; account_name?: string; created_at?: string; client_note?: string; purchase_order_id: string; client_ord: string; supplier_name: string; status: string; requested_delivery_date: string; total_amount: number; items: OrderItem[]; supplier_result_code?: string; supplier_result_message?: string; preference_changes?: PreferenceChange[] }

export const ORDER_STATUS_LABELS: Record<string, string> = { SENDING: '전송 중', UNKNOWN: '결과 확인 필요', ORDERED: '주문 접수', CONFIRMED: '주문 확인', PARTIAL_FAILED: '일부 품목 확인 필요', FAILED: '실패', PARTIAL_RECEIVED: '부분입고', RECEIVED: '입고완료', NOT_RECEIVED: '미입고', CANCELED: '취소' }
/** 입고 확정을 할 수 있는 상태 */
export const RECEIVABLE_STATUSES = ['ORDERED', 'CONFIRMED', 'PARTIAL_RECEIVED', 'NOT_RECEIVED']
/** 공급사 접수 여부를 다시 조회해야 하는 상태 */
export const UNCERTAIN_STATUSES = ['UNKNOWN', 'SENDING', 'PARTIAL_FAILED']

const today = () => new Date().toLocaleDateString('sv-SE')
export const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return date.toLocaleDateString('sv-SE') }

async function request(path: string, body?: unknown) {
  const response = await fetch(buildApiUrl(path), body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.')
  return data
}

/**
 * 발주서 조회·공급사 접수 재조회·입고 확정(PC 발주서 관리·터치 화면 공용).
 * focusedId가 있으면 그 발주서 하나만 조회한다(알림·식단 사용 확정에서 바로 가기).
 */
export function usePurchaseOrders(accountId: string, focusedId: string) {
  const [from, setFrom] = useState(() => daysAgo(30))
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [receiptDate, setReceiptDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [supplierId, setSupplierId] = useState('')
  // 공급사 조회 조건: 이 거래처에 연결된 공급사 + 조회된 발주서의 공급사(연결이 끊긴 공급사의 과거 발주서도 고를 수 있게)
  const [siteSuppliers, setSiteSuppliers] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    if (!accountId) return
    let active = true
    getSupplierSites(accountId).then(sites => { if (active) setSiteSuppliers(sites.map(site => ({ id: String(site.supplier_id), name: site.supplier_name }))) }).catch(() => { /* 목록 실패해도 조회된 발주서의 공급사로 고를 수 있다 */ })
    return () => { active = false }
  }, [accountId])
  const receiptRequest = useRef<{ signature: string; key: string } | null>(null)

  const load = useCallback(async () => {
    if (!accountId) { setMessage('로그인한 고객사를 확인해 주세요.'); return }
    if (from > to) { setMessage('조회 시작일과 종료일을 확인해 주세요.'); return }
    setBusy(true); setMessage('')
    try {
      const query = new URLSearchParams({ account_id: accountId, date_from: from, date_to: to, status, offset: String(offset), limit: '50' })
      if (supplierId) query.set('supplier_id', supplierId)
      if (focusedId) { query.set('purchase_order_id', focusedId); query.delete('date_from'); query.delete('date_to'); query.delete('status'); query.delete('supplier_id') }
      const result = await request(`/Procurement/Orders?${query}`)
      setOrders(result.orders)
      setSelected(current => result.orders.find((order: PurchaseOrder) => order.purchase_order_id === (focusedId || current?.purchase_order_id)) || result.orders[0] || null)
    } catch (error) { setMessage(error instanceof Error ? error.message : '조회 실패') }
    finally { setBusy(false) }
  }, [accountId, from, to, status, supplierId, offset, focusedId])
  useEffect(() => { void load() }, [load])
  const suppliers = useMemo(() => {
    const byId = new Map(siteSuppliers.map(s => [s.id, s]))
    for (const order of orders) if (order.supplier_id != null && !byId.has(String(order.supplier_id))) byId.set(String(order.supplier_id), { id: String(order.supplier_id), name: order.supplier_name })
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [siteSuppliers, orders])

  const selectOrder = (order: PurchaseOrder | null) => { setSelected(order); setQuantities({}); receiptRequest.current = null }

  const reconcile = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await request('/Procurement/Reconcile', { account_id: accountId, purchase_order_id: selected.purchase_order_id })
      await load(); setMessage(`공급사 조회: ${result.query_message || result.message || "조회 완료"}${result.query_result_code ? ` (${result.query_result_code})` : ""} · 주문 상태: ${ORDER_STATUS_LABELS[result.status] || result.status}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '대사 실패') }
    finally { setBusy(false) }
  }

  /** 이번 입고 수량: 직접 고친 값, 없으면 미입고 잔량(주문량 − 기입고) */
  const receiptQuantity = (item: OrderItem) => quantities[item.client_ord_item]
    ?? String(Math.max(0, Math.round((Number(item.order_qty) - Number(item.received_order_qty)) * 1000) / 1000))
  const setReceiptQuantity = (item: OrderItem, value: string) => setQuantities(current => ({ ...current, [item.client_ord_item]: value }))

  const receive = async () => {
    if (!selected) return
    const items = selected.items.filter(item => Number(receiptQuantity(item)) > 0).map(item => ({ client_ord_item: item.client_ord_item, received_qty: Number(receiptQuantity(item)) }))
    if (!items.length) { setMessage('이번에 실제 입고된 수량을 입력해 주세요.'); return }
    const signature = JSON.stringify({ order: selected.purchase_order_id, receiptDate, items })
    if (receiptRequest.current?.signature !== signature) receiptRequest.current = { signature, key: newRequestKey() }
    setBusy(true)
    try {
      await request('/Procurement/Receive', { account_id: accountId, purchase_order_id: selected.purchase_order_id, receipt_date: receiptDate, receipt_key: receiptRequest.current.key, user_id: localStorage.getItem('user_id') || '', items })
      setQuantities({}); receiptRequest.current = null
      await load(); setMessage('실제 입고수량을 재고에 반영했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '입고 처리 실패') }
    finally { setBusy(false) }
  }

  return {
    from, setFrom, to, setTo, status, setStatus, offset, setOffset, supplierId, setSupplierId, suppliers,
    orders, selected, selectOrder, busy, message, load, reconcile,
    receiptDate, setReceiptDate, receiptQuantity, setReceiptQuantity, receive,
  }
}
