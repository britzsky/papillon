import { useEffect, useMemo, useState } from 'react'
import { getAllItemPrice, getOrderList, getReceiveDetail, getSituationDetail, getSoldToList, type ApiRecord, type Product, type Workplace } from '../../api/welstory'

export type Tab = 'products' | 'orders' | 'receives' | 'situations'
export const text = (value: unknown) => value == null ? '' : String(value)
export const compact = (value: string) => value.replaceAll('-', '')
export const today = () => new Date().toISOString().slice(0, 10)
export const money = (value: number) => new Intl.NumberFormat('ko-KR').format(value)
export const DEFAULT_WORKPLACE: Workplace = {
  soldTo: 'A0199183',
  soldToNm: '더채움',
  payerNm: '',
  pricingCode: '',
  repSoldtoYn: '',
}
export const withDefaultWorkplace = (items: Workplace[]) =>
  items.some((item) => item.soldTo === DEFAULT_WORKPLACE.soldTo)
    ? items
    : [DEFAULT_WORKPLACE, ...items]
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.'

/**
 * 웰스토리 원문 조회(PC·터치 공용): 사업장, 전체 판가(연도·순기) 상품, 주문·입고·반품교환 내역. 주문 전송은 막혀 있다(발주하기에서).
 */
export function useWelstoryRaw() {
  const [tab, setTab] = useState<Tab>('products')
  const [workplaces, setWorkplaces] = useState<Workplace[]>([DEFAULT_WORKPLACE])
  const [soldTo, setSoldTo] = useState(DEFAULT_WORKPLACE.soldTo)
  const [periodYear, setPeriodYear] = useState(() => localStorage.getItem('welstory_period_year') || String(new Date().getFullYear()))
  const [periodGroup, setPeriodGroup] = useState(() => localStorage.getItem('welstory_period_group') || '')
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<ApiRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    getSoldToList(controller.signal).then((rows) => {
      setWorkplaces(withDefaultWorkplace(rows))
    }).catch((error) => setMessage(errorMessage(error))).finally(() => setBusy(false))
    return () => controller.abort()
  }, [])

  const selectedWorkplace = workplaces.find((item) => item.soldTo === soldTo)
  const filtered = useMemo(() => products.filter((item) => `${item.itemCode} ${item.itemName} ${item.standard}`.toLowerCase().includes(query.toLowerCase())), [products, query])
  const saveSoldTo = (value: string) => { setSoldTo(value); localStorage.setItem('welstory_sold_to', value); setProducts([]); setRecords([]) }

  const loadProducts = async () => {
    if (!soldTo) return setMessage('사업장을 선택해 주세요.')
    if (!/^\d{4}$/.test(periodYear)) return setMessage('판가 연도를 4자리로 입력해 주세요.')
    if (!/^\d{2}$/.test(periodGroup)) return setMessage('웰스토리 순기를 2자리로 입력해 주세요. 예: 12')
    setBusy(true); setMessage('')
    try {
      localStorage.setItem('welstory_period_year', periodYear)
      localStorage.setItem('welstory_period_group', periodGroup)
      setProducts(await getAllItemPrice(soldTo, periodYear, periodGroup))
    }
    catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) }
  }
  const loadRecords = async (nextTab: Tab) => {
    if (!soldTo) return setMessage('사업장을 선택해 주세요.')
    setBusy(true); setMessage(''); setTab(nextTab)
    try {
      const date = compact(deliveryDate)
      setRecords(nextTab === 'orders' ? await getOrderList(soldTo, date) : nextTab === 'receives' ? await getReceiveDetail(soldTo, date) : await getSituationDetail(soldTo, date, date))
    } catch (error) { setRecords([]); setMessage(errorMessage(error)) } finally { setBusy(false) }
  }

  return { tab, setTab, workplaces, setWorkplaces, soldTo, setSoldTo, periodYear, setPeriodYear, periodGroup, setPeriodGroup, deliveryDate, setDeliveryDate, query, setQuery, products, setProducts, records, setRecords, busy, setBusy, message, setMessage, selectedWorkplace, filtered, saveSoldTo, loadProducts, loadRecords }
}
