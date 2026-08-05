import { buildApiUrl } from '../config/api'

export type ItemLookupRequest = { soldTo: string; itemCode: string; reqDeliveryDate: string }
export type ItemLookupItem = {
  itemCode: string; reqDeliveryDate: string; plant: string; classA: string; classB: string; classC: string
  classD: string; closeCode: string; itemName: string; standard: string; unit: string; price: number
  taxCode: string; leadTime: number; minQntty: number; orderIncrs: number; deliveryType: string
  origin: string; rawMaterialOrigin1: string; rawMaterialOrigin2: string; strgTmprt: string; decYN: string
  placePrchs: string; useDt: string; boxVolume: string; boxInnCnt: number; newCntrc: string; stopType: string
}

type RawRecord = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
const number = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(text(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function createGuid() {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}01`
}

function isValidCompactDate(value: string) {
  if (!/^\d{8}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function validateItemLookupRequest(request: ItemLookupRequest) {
  if (!request.soldTo) return '사업장코드를 입력해 주세요.'
  if (request.soldTo.length > 10) return '사업장코드는 10자리 이하여야 합니다.'
  if (!request.itemCode) return '품목코드를 입력해 주세요.'
  if (request.itemCode.length > 18) return '품목코드는 18자리 이하여야 합니다.'
  if (!isValidCompactDate(request.reqDeliveryDate)) return '입고일자를 YYYYMMDD 형식으로 입력해 주세요.'
  return ''
}

function normalize(item: RawRecord): ItemLookupItem {
  return {
    itemCode: text(item.itemCode), reqDeliveryDate: text(item.reqDeliveryDate), plant: text(item.plant),
    classA: text(item.classA), classB: text(item.classB), classC: text(item.classC), classD: text(item.classD),
    closeCode: text(item.closeCode), itemName: text(item.itemName), standard: text(item.standard), unit: text(item.unit),
    price: number(item.price), taxCode: text(item.taxCode), leadTime: number(item.leadTime),
    minQntty: number(item.minQntty), orderIncrs: number(item.orderIncrs), deliveryType: text(item.deliveryType),
    origin: text(item.origin), rawMaterialOrigin1: text(item.rawMaterialOrigin1),
    rawMaterialOrigin2: text(item.rawMaterialOrigin2), strgTmprt: text(item.strgTmprt), decYN: text(item.decYN),
    placePrchs: text(item.placePrchs), useDt: text(item.useDt), boxVolume: text(item.boxVolume),
    boxInnCnt: number(item.boxInnCnt), newCntrc: text(item.newCntrc), stopType: text(item.stopType),
  }
}

export async function lookupItem(request: ItemLookupRequest, signal?: AbortSignal): Promise<ItemLookupItem[]> {
  const normalizedRequest = {
    soldTo: request.soldTo.trim(),
    itemCode: request.itemCode.trim(),
    reqDeliveryDate: request.reqDeliveryDate.trim(),
  }
  const validationError = validateItemLookupRequest(normalizedRequest)
  if (validationError) throw new Error(validationError)

  const configured = import.meta.env.VITE_ITEM_LOOKUP_API_URL?.trim()
  const response = await fetch(configured || buildApiUrl('/Order/ItemLookup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', guid: createGuid() },
    body: JSON.stringify({ dataHeader: normalizedRequest, dataBody: {} }),
    signal,
  })
  if (!response.ok) throw new Error(`품목 조회 통신에 실패했습니다. (${response.status})`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) throw new Error('품목 조회 응답 형식이 올바르지 않습니다.')
  const payload = (await response.json()) as RawRecord
  const body = (payload.dataBody ?? payload) as RawRecord
  if (text(body.resCd) && text(body.resCd) !== 'S0000') throw new Error(text(body.resMsg) || `품목 조회 오류 (${text(body.resCd)})`)
  const data = body.data
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : []
  return rows.map((row) => normalize(row as RawRecord)).filter((row) => row.itemCode || row.itemName)
}
