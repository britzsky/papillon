import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import { getSupplierSites } from '../../api/supplierIntegration'
import { newRequestKey } from '../../utils/requestKey'
import { cancelShortage as cancelShortageApi, registerShortage, shortageMessage, type ShortageSource } from '../../api/receiving'

export type OrderItem = { supplier_product_id?: number; favorite_yn?: 'Y' | 'N' | null; unit_price_snapshot?: number; line_amount?: number; source_ingredient_id?: string; ingredient_id?: string | null; ingredient_name?: string | null; base_unit?: string; base_qty_per_order_unit?: number; product_base_unit?: string; supplier_item_code?: string; client_ord_item: string; product_name: string; order_qty: number; received_order_qty: number; shortage_order_qty?: number | null; delivery_type?: string | null; delivery_type_raw?: string | null; order_unit: string; item_status: string; supplier_result_code?: string; supplier_error_message?: string }
export type PurchaseOrder = { supplier_id?: number | string; sold_to?: string; site_name?: string; account_name?: string; created_at?: string; client_note?: string; purchase_order_id: string; client_ord: string; supplier_name: string; status: string; requested_delivery_date: string; total_amount: number; items: OrderItem[]; supplier_result_code?: string; supplier_result_message?: string; supplier_code?: string; inspected_at?: string | null; inspected_by?: string | null }

export const ORDER_STATUS_LABELS: Record<string, string> = { SENDING: '전송 중', UNKNOWN: '결과 확인 필요', ORDERED: '주문 접수', CONFIRMED: '주문 확인', PARTIAL_FAILED: '일부 품목 확인 필요', FAILED: '실패', PARTIAL_RECEIVED: '부분입고', RECEIVED: '입고완료', NOT_RECEIVED: '미입고', CANCELED: '취소' }
/** 입고 확정을 할 수 있는 상태 */
export const RECEIVABLE_STATUSES = ['ORDERED', 'CONFIRMED', 'PARTIAL_RECEIVED', 'NOT_RECEIVED']
/** 공급사 접수 여부를 다시 조회해야 하는 상태 */
export const UNCERTAIN_STATUSES = ['UNKNOWN', 'SENDING', 'PARTIAL_FAILED']

const today = () => new Date().toLocaleDateString('sv-SE')
const round3 = (value: number) => Math.round(value * 1000) / 1000
/** 아직 안 들어온 수량: 주문 − 이미 입고 − 결품 처리 */
export const remainingQty = (item: OrderItem) => Math.max(0, round3(Number(item.order_qty) - Number(item.received_order_qty) - Number(item.shortage_order_qty || 0)))
/** 남는 수량 처리: 배송 대기(나중에 옴, 기본) 또는 결품(남은 수량을 닫음) */
export type LeftoverChoice = 'WAIT' | 'SHORTAGE'
/** 남은 품목을 모두 결품으로 닫은 발주서(서버 상태는 미입고지만 더 처리할 것이 없음) */
export const closedByShortage = (order: PurchaseOrder) => order.status === 'NOT_RECEIVED' && order.items?.length > 0
  && order.items.some(i => Number(i.shortage_order_qty || 0) > 0) && order.items.every(i => ['FAILED', 'CANCELED'].includes(i.item_status) || remainingQty(i) === 0)
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
 * focusMode 'select'(PC, 2026-11-25 사용자 요청): 목록은 평소처럼 전부 조회하고 그 발주서만 골라 둔다. 조회 기간 밖이면 따로 불러와 맨 위에 붙인다.
 */
export function usePurchaseOrders(accountId: string, focusedId: string, focusMode: 'only' | 'select' = 'only') {
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
  // 상품만 발주한 줄(재고에 넣을 식재료가 없음)은 입고할 때 식재료를 고른다(2026-10-22: 식재료와 상품을 연결하지 않음)
  const [ingredients, setIngredients] = useState<Array<{ ingredient_id: string; ingredient_name: string; base_unit: string }>>([])
  const [choices, setChoices] = useState<Record<string, { ingredient_id: string; per_unit: string }>>({})
  useEffect(() => {
    if (!accountId) return
    let active = true
    fetch(buildApiUrl(`/v2/menu-management/ingredients/account?${new URLSearchParams({ account_id: accountId })}`))
      .then(async response => { const data = await response.json().catch(() => null); if (!response.ok || !Array.isArray(data)) throw new Error(); return data as Array<Record<string, unknown>> })
      .then(rows => { if (active) setIngredients(rows.map(row => ({ ingredient_id: String(row.ingredient_id ?? ''), ingredient_name: String(row.ingredient_name ?? row.ingredient_name_std ?? row.ingredient_id ?? ''), base_unit: String(row.base_unit ?? '') }))
        .filter(row => row.ingredient_id).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, 'ko'))) })
      .catch(() => { if (active) setIngredients([]) })
    return () => { active = false }
  }, [accountId])
  const receiptChoice = (item: OrderItem) => choices[item.client_ord_item] ?? { ingredient_id: '', per_unit: '' }
  const setReceiptChoice = (item: OrderItem, patch: Partial<{ ingredient_id: string; per_unit: string }>) =>
    setChoices(current => ({ ...current, [item.client_ord_item]: { ...receiptChoice(item), ...patch } }))
  const needsIngredient = (item: OrderItem) => !item.ingredient_id

  const load = useCallback(async () => {
    if (!accountId) { setMessage('로그인한 고객사를 확인해 주세요.'); return }
    if (from > to) { setMessage('조회 시작일과 종료일을 확인해 주세요.'); return }
    setBusy(true); setMessage('')
    try {
      const query = new URLSearchParams({ account_id: accountId, date_from: from, date_to: to, status, offset: String(offset), limit: '50' })
      if (supplierId) query.set('supplier_id', supplierId)
      if (focusedId && focusMode === 'only') { query.set('purchase_order_id', focusedId); query.delete('date_from'); query.delete('date_to'); query.delete('status'); query.delete('supplier_id') }
      const result = await request(`/Procurement/Orders?${query}`)
      let list: PurchaseOrder[] = result.orders
      if (focusedId && focusMode === 'select' && !list.some(order => order.purchase_order_id === focusedId)) {
        const one = await request(`/Procurement/Orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: focusedId, offset: '0', limit: '1' })}`).catch(() => null)
        if (one?.orders?.length) list = [...one.orders, ...list]
      }
      setOrders(list)
      setSelected(current => list.find(order => order.purchase_order_id === (focusMode === 'select' ? current?.purchase_order_id || focusedId : focusedId || current?.purchase_order_id)) || list[0] || null)
    } catch (error) { setMessage(error instanceof Error ? error.message : '조회 실패') }
    finally { setBusy(false) }
  }, [accountId, from, to, status, supplierId, offset, focusedId, focusMode])
  useEffect(() => { void load() }, [load])
  const suppliers = useMemo(() => {
    const byId = new Map(siteSuppliers.map(s => [s.id, s]))
    for (const order of orders) if (order.supplier_id != null && !byId.has(String(order.supplier_id))) byId.set(String(order.supplier_id), { id: String(order.supplier_id), name: order.supplier_name })
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [siteSuppliers, orders])

  // 결품: 받은 수량이 남은 수량보다 적은 줄의 나머지를 "배송 대기"로 둘지 "결품"으로 닫을지(기본 배송 대기)
  const [leftovers, setLeftovers] = useState<Record<string, LeftoverChoice>>({})
  const [shortageForm, setShortageForm] = useState<{ source: ShortageSource; reason: string; contact_name: string }>({ source: 'SITE_CHECK', reason: '', contact_name: '' })
  const [shortageNotice, setShortageNotice] = useState<{ orderId: string; text: string } | null>(null)
  const leftoverQty = (item: OrderItem) => Math.max(0, round3(remainingQty(item) - (Number(receiptQuantity(item)) || 0)))
  const leftoverChoice = (item: OrderItem): LeftoverChoice => leftovers[item.client_ord_item] ?? 'WAIT'
  const setLeftoverChoice = (item: OrderItem, choice: LeftoverChoice) => setLeftovers(current => ({ ...current, [item.client_ord_item]: choice }))
  const shortageLines = (order: PurchaseOrder | null) => order ? order.items.filter(item => leftoverChoice(item) === 'SHORTAGE' && leftoverQty(item) > 0) : []
  const selectOrder = (order: PurchaseOrder | null) => { setSelected(order); setQuantities({}); setChoices({}); setLeftovers({}); receiptRequest.current = null }

  const reconcile = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await request('/Procurement/Reconcile', { account_id: accountId, purchase_order_id: selected.purchase_order_id })
      await load(); setMessage(`공급사 조회: ${result.query_message || result.message || "조회 완료"}${result.query_result_code ? ` (${result.query_result_code})` : ""} · 주문 상태: ${ORDER_STATUS_LABELS[result.status] || result.status}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '대사 실패') }
    finally { setBusy(false) }
  }

  /** 검수완료(done=true)·검수 취소: 공급사 발주서 한 장 단위. 검수완료 뒤에만 입고 처리가 열린다(서버도 막음) */
  const inspect = async (done: boolean) => {
    if (!selected) return
    setBusy(true)
    try {
      await request('/Procurement/Inspect', { account_id: accountId, purchase_order_id: selected.purchase_order_id, user_id: localStorage.getItem('user_id') || '', done })
      await load(); setMessage(done ? `${selected.supplier_name} 검수완료 · 받은 수량 확인 후 입고 처리하세요.` : `${selected.supplier_name} 검수를 취소했습니다.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '검수 처리 실패') }
    finally { setBusy(false) }
  }
  /** 검수서 인쇄용: 납품일 하루치 발주서(공급사 구분 없이, 실패·취소 제외) */
  const ordersForDelivery = async (date: string) => {
    const result = await request(`/Procurement/Orders?${new URLSearchParams({ account_id: accountId, delivery_date: date, limit: '200' })}`)
    return (result.orders as PurchaseOrder[]).filter(order => !['FAILED', 'CANCELED'].includes(order.status))
  }

  /** 이번 입고 수량: 직접 고친 값, 없으면 미입고 잔량(주문량 − 기입고) */
  const receiptQuantity = (item: OrderItem) => quantities[item.client_ord_item] ?? String(remainingQty(item))
  const setReceiptQuantity = (item: OrderItem, value: string) => setQuantities(current => ({ ...current, [item.client_ord_item]: value }))

  /** 입고(검수완료 뒤) + 결품 확정. shortageOnly면 결품만 확정(공급사가 먼저 연락한 경우 등 검수 전에도 됨) */
  const receive = async (shortageOnly = false) => {
    if (!selected) return
    const receiving = shortageOnly ? [] : selected.items.filter(item => Number(receiptQuantity(item)) > 0)
    const shortages = shortageLines(selected).map(item => ({ item, qty: leftoverQty(item) }))
    const missing = receiving.filter(item => needsIngredient(item) && !receiptChoice(item).ingredient_id)
    if (missing.length) { setMessage(`재고에 넣을 식재료 선택 요망: ${missing.map(item => item.product_name).join(', ')}`); return }
    const items = receiving.map(item => ({ client_ord_item: item.client_ord_item, received_qty: Number(receiptQuantity(item)),
      ...(needsIngredient(item) ? { ingredient_id: receiptChoice(item).ingredient_id, ...(Number(receiptChoice(item).per_unit) > 0 ? { base_qty_per_order_unit: Number(receiptChoice(item).per_unit) } : {}) } : {}) }))
    if (!items.length && !shortages.length) { setMessage('이번에 실제 입고된 수량을 입력해 주세요.'); return }
    // 입고는 검수완료 뒤에만. 결품만 확정(공급사가 먼저 연락 등)은 검수 전에도 된다
    if (items.length && !selected.inspected_at) { setMessage('검수완료 전 · 검수서로 확인 후 검수완료 요망'); return }
    const signature = JSON.stringify({ order: selected.purchase_order_id, receiptDate, items })
    if (receiptRequest.current?.signature !== signature) receiptRequest.current = { signature, key: newRequestKey() }
    setBusy(true)
    let received = false
    try {
      if (items.length) {
        await request('/Procurement/Receive', { account_id: accountId, purchase_order_id: selected.purchase_order_id, receipt_date: receiptDate, receipt_key: receiptRequest.current.key, user_id: localStorage.getItem('user_id') || '', items })
        received = true
      }
      if (shortages.length) {
        await registerShortage({ account_id: accountId, purchase_order_id: selected.purchase_order_id, source: shortageForm.source,
          reason: shortageForm.reason.trim(), contact_name: shortageForm.contact_name.trim(), user_id: localStorage.getItem('user_id') || '',
          items: shortages.map(({ item, qty }) => ({ client_ord_item: item.client_ord_item, shortage_qty: qty })) })
        setShortageNotice({ orderId: selected.purchase_order_id, text: shortageMessage(selected, shortages.map(({ item, qty }) => ({ product_name: item.product_name, supplier_item_code: item.supplier_item_code, order_qty: Number(item.order_qty), shortage_qty: qty, order_unit: item.order_unit })), shortageForm.reason.trim()) })
      }
      setQuantities({}); setChoices({}); setLeftovers({}); setShortageForm(form => ({ ...form, reason: '', contact_name: '' })); receiptRequest.current = null
      await load()
      setMessage([received ? '실제 입고수량을 재고에 반영했습니다.' : '', shortages.length ? `결품 ${shortages.length}품목을 확정했습니다 · 입고 예정·재고·금액에서 뺐어요.` : ''].filter(Boolean).join(' '))
    } catch (error) {
      const text = error instanceof Error ? error.message : '처리 실패'
      if (received) { setQuantities({}); setChoices({}); receiptRequest.current = null; await load() }
      setMessage(received ? `입고는 반영했지만 결품 확정 실패: ${text}` : text)
    }
    finally { setBusy(false) }
  }

  /** 결품 취소(늦게라도 들어옴): 남은 수량이 다시 입고 예정으로 돌아간다 */
  const cancelShortage = async (item: OrderItem) => {
    if (!selected) return
    setBusy(true)
    try {
      await cancelShortageApi({ account_id: accountId, purchase_order_id: selected.purchase_order_id, client_ord_item: item.client_ord_item, user_id: localStorage.getItem('user_id') || '' })
      setQuantities(current => { const next = { ...current }; delete next[item.client_ord_item]; return next })
      await load(); setMessage(`${item.product_name} 결품을 취소했습니다 · 다시 입고할 수 있어요.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '결품 취소 실패') }
    finally { setBusy(false) }
  }

  return {
    from, setFrom, to, setTo, status, setStatus, offset, setOffset, supplierId, setSupplierId, suppliers,
    orders, selected, selectOrder, busy, message, load, reconcile, inspect, ordersForDelivery,
    receiptDate, setReceiptDate, receiptQuantity, setReceiptQuantity, receive,
    leftoverQty, leftoverChoice, setLeftoverChoice, shortageLines, shortageForm, setShortageForm, shortageNotice, setShortageNotice, cancelShortage,
    ingredients, receiptChoice, setReceiptChoice, needsIngredient,
  }
}
