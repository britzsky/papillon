import { buildApiUrl } from '../config/api'

export type OurhomeProduct = Record<'goodcd' | 'goodnm' | 'goodsz' | 'boxInQty' | 'originPlaceNm' | 'taxYn' | 'salsUcost' | 'salsUcostKg' | 'orderdtInfo' | 'ordInfo' | 'keepTemp' | 'deliveyType' | 'odrUnit' | 'odrConvqty' | 'goodStatus' | 'goodStatusNm' | 'vanNm' | 'unquantityYn' | 'odrupYn' | 'odrupYnDesc' | 'decOdrupYn' | 'ordTime' | 'img1' | 'img2' | 'imageRoute', string>
export type OurhomeOrder = Record<'ordKeyVal' | 'ordSeq' | 'foSeq' | 'extnOrderKey' | 'extnOrderNo' | 'goodcd' | 'goodnm' | 'goodsz' | 'odrUnit' | 'clhaqty' | 'salsUcost' | 'salsAmt' | 'originPlaceNm' | 'ordStatYn' | 'prcsStatYn' | 'delYn' | 'idenNo' | 'expireInfo' | 'depositDt', string>
export type OurhomeProducts = { checkedAt: string; siteCode: string; deliveryDate: string; totalRow: number; hasNext: boolean; nextKey: string; products: OurhomeProduct[] }
export type OurhomeOrders = { checkedAt: string; siteCode: string; deliveryDate: string; orders: OurhomeOrder[] }

async function get<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const response = await fetch(buildApiUrl(`/v2/supplier-integration/ourhome/${path}?${new URLSearchParams(params)}`), { cache: 'no-store', signal })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.message || '아워홈 조회에 실패했습니다.')
  return payload as T
}
export const getOurhomeProducts = (params: { siteCode: string; deliveryDate: string; keyword: string; searchType: string; nextKey: string }, signal: AbortSignal) => get<OurhomeProducts>('products', params, signal)
export const getOurhomeOrders = (siteCode: string, deliveryDate: string, signal: AbortSignal) => get<OurhomeOrders>('orders', { siteCode, deliveryDate }, signal)
