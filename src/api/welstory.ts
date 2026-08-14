import { buildApiUrl } from '../config/api'

export type ApiRecord = Record<string, unknown>
export type Workplace = { soldTo: string; soldToNm: string; payerNm: string; pricingCode: string; repSoldtoYn: string }
export type Product = ApiRecord & { itemCode: string; itemName: string; standard: string; unit: string; price: number; minQntty: number; orderIncrs: number; stopType: string; reqDeliveryDate: string }
export type CartLine = Product & { quantity: number; clientOrdItem?: string; status?: 'N' | 'U' | 'D' }
export type OrderResult = { resCd: string; resMsg: string; items: ApiRecord[] }

const stringValue = (value: unknown) => value == null ? '' : String(value).trim()
const numberValue = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function unwrap(payload: ApiRecord) {
  const body = (payload.dataBody ?? payload) as ApiRecord
  const resCd = stringValue(body.resCd)
  if (resCd && resCd !== 'S0000') throw new Error(stringValue(body.resMsg) || `API 오류 (${resCd})`)
  const data = body.data
  return { body, rows: Array.isArray(data) ? data as ApiRecord[] : data && typeof data === 'object' ? [data as ApiRecord] : [] }
}

async function post(path: string, dataHeader: ApiRecord, dataBody: ApiRecord = {}, signal?: AbortSignal) {
  const response = await fetch(buildApiUrl(`/Order/Welstory/${path}`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataHeader, dataBody }), signal,
  })
  if (!response.ok) throw new Error(`서버 통신에 실패했습니다. (${response.status})`)
  return response.json() as Promise<ApiRecord>
}

async function paged(path: string, body: ApiRecord, signal?: AbortSignal) {
  const rows: ApiRecord[] = []
  let contYn = 'N', nextKey = ''
  do {
    const payload = await post(path, { pageRow: 10000, contYn, nextKey }, body, signal)
    const result = unwrap(payload)
    rows.push(...result.rows)
    const header = (payload.dataHeader ?? result.body.dataHeader ?? {}) as ApiRecord
    contYn = stringValue(header.contYn)
    nextKey = stringValue(header.nextKey)
  } while (contYn === 'Y' && nextKey)
  return rows
}

const normalizeProduct = (row: ApiRecord): Product => ({
  ...row, itemCode: stringValue(row.itemCode), itemName: stringValue(row.itemName),
  standard: stringValue(row.standard), unit: stringValue(row.unit), price: numberValue(row.price),
  minQntty: numberValue(row.minQntty), orderIncrs: numberValue(row.orderIncrs),
  stopType: stringValue(row.stopType), reqDeliveryDate: stringValue(row.reqDeliveryDate),
})

export async function getSoldToList(signal?: AbortSignal): Promise<Workplace[]> {
  return (await paged('SoldToList', {}, signal)).map((row) => ({
    soldTo: stringValue(row.soldTo ?? row.solTo), soldToNm: stringValue(row.soldToNm),
    payerNm: stringValue(row.payerNm ?? row.payerDesc), pricingCode: stringValue(row.pricingCode),
    repSoldtoYn: stringValue(row.repSoldtoYn),
  })).filter((row) => row.soldTo)
}

export async function getAllItemPrice(soldTo: string, year: string, period: string, signal?: AbortSignal) {
  return (await paged('AllItemPrice', { soldTo, periodGroupYear: year, periodGroup: period }, signal)).map(normalizeProduct)
}

export async function getRealtimeItem(soldTo: string, itemCode: string, reqDeliveryDate: string) {
  const result = unwrap(await post('RealtimeItem', { soldTo, itemCode, reqDeliveryDate }))
  return result.rows.map(normalizeProduct)[0]
}

export async function transactOrder(header: ApiRecord, lines: CartLine[]): Promise<OrderResult> {
  const payload = await post('OrderTransaction', header, { ordDetail: lines.map((line, index) => ({
    clientOrd: header.clientOrd, clientOrdItem: line.clientOrdItem || String(index + 1), itemCode: line.itemCode,
    ordQty: String(line.quantity), specialNote: '', itemDeliveryDate: header.reqDeliveryDate,
    ordItemStatus: line.status || 'N',
  })) })
  const body = (payload.dataBody ?? payload) as ApiRecord
  const data = body.data
  return { resCd: stringValue(body.resCd), resMsg: stringValue(body.resMsg), items: Array.isArray(data) ? data as ApiRecord[] : [] }
}

export async function getOrderList(soldTo: string, reqDeliveryDate: string, clientOrd = '') {
  return unwrap(await post('OrderList', { soldTo, reqDeliveryDate, clientOrd })).rows
}
export async function getReceiveDetail(soldTo: string, reqDeliveryDate: string) {
  return unwrap(await post('ReceiveDetail', { soldTo, reqDeliveryDate })).rows
}
export async function getSituationDetail(soldTo: string, from: string, to: string) {
  return unwrap(await post('SituationDetail', { soldTo, deliDateFrom: from, deliDateTo: to, crDateFrom: '', crDateTo: '', clientOrd: '' })).rows
}
