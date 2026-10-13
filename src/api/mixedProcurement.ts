import { buildApiUrl } from '../config/api'
import type { ShortageCriteria } from './shortageProcurement'
import { newRequestKey } from '../utils/requestKey'

export type BatchItem = { delivery_terms_confirmed?: boolean; supplier_offer_id: number; delivery_date: string; order_qty: number; expected_price: number; source_ingredient_id?: string }
export type BatchInput = { account_id: string; items: BatchItem[]; shortage_criteria?: ShortageCriteria }
export type PreferenceChange = { client_ord_item: string; ingredient_id: string; product_name: string; undone: boolean }
export type BatchOrder = { supplier_code: string; supplier_name: string; external_site_code: string; delivery_date: string; purchase_order_id?: string; status: string; message?: string; replayed?: boolean; requires_reconciliation?: boolean; preference_changes?: PreferenceChange[] }
export type BatchResult = { request_key: string; orders: BatchOrder[] }

export async function undoOrderPreference(accountId: string, orderId: string, item: string): Promise<void> {
  const response = await fetch(buildApiUrl('/Procurement/UndoPreference'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, purchase_order_id: orderId, client_ord_item: item }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '우선 상품을 되돌리지 못했습니다.')
}
type Pending = { signature: string; body: BatchInput & { request_key: string; user_id: string }; resolved: boolean }
const storageKey = (account: string) => `mixed-procurement:${account}`
function pending(account: string): Pending | null {
  try { return JSON.parse(sessionStorage.getItem(storageKey(account)) || 'null') as Pending | null } catch { return null }
}
async function send(entry: Pending): Promise<BatchResult> {
  const response = await fetch(buildApiUrl('/Procurement/OrdersBatch'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry.body) })
  const data = await response.json()
  if (!response.ok) {
    if (data.not_submitted === true) { entry.resolved = true; sessionStorage.setItem(storageKey(entry.body.account_id), JSON.stringify(entry)) }
    throw new Error(data.message || '발주 결과를 확인하지 못했습니다. 같은 요청으로 결과를 다시 확인해주세요.')
  }
  if (!Array.isArray(data.orders)) throw new Error('발주 결과 형식을 확인할 수 없습니다.')
  entry.resolved = data.orders.every((order: BatchOrder) => ['ORDERED', 'CONFIRMED', 'FAILED', 'VALIDATION_FAILED', 'RECEIVED', 'PARTIAL_RECEIVED', 'NOT_RECEIVED', 'CANCELED'].includes(order.status) || (order.status === 'PARTIAL_FAILED' && order.requires_reconciliation === false))
  sessionStorage.setItem(storageKey(entry.body.account_id), JSON.stringify(entry))
  return data as BatchResult
}
export async function submitMixedProcurement(input: BatchInput): Promise<BatchResult> {
  const signature = JSON.stringify(input)
  let entry = pending(input.account_id)
  if (entry && entry.signature !== signature && !entry.resolved) throw new Error('이전 발주 결과가 확인되지 않았습니다. 이전 요청 결과 확인 버튼으로 먼저 확인해주세요.')
  if (!entry || entry.signature !== signature) entry = { signature, body: { ...input, request_key: newRequestKey(), user_id: localStorage.getItem('user_id') || '' }, resolved: false }
  sessionStorage.setItem(storageKey(input.account_id), JSON.stringify(entry))
  return send(entry)
}
export async function recoverMixedProcurement(account: string): Promise<BatchResult> {
  const entry = pending(account)
  if (!entry) throw new Error('확인할 이전 요청이 없습니다.')
  return send(entry)
}
export function startNewMixedProcurement(account: string) {
  const entry = pending(account)
  if (entry && !entry.resolved) throw new Error('접수 확인이 필요한 주문이 있습니다. 발주서에서 대사하고 이전 요청 결과를 다시 확인해주세요.')
  sessionStorage.removeItem(storageKey(account))
}
