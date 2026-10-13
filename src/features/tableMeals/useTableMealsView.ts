import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getAccountMealSlots,
  getAccountOptions,
  getTableMealsDetailList,
  getTableMealsList,
  type AccountMealSlot,
  type AccountOption,
  type TableMealsDetailItem,
  type TableMealsItem,
} from '../../api/operations'
import {
  ACCOUNT_MEAL_SLOT_ROWS,
  DETAIL_MEAL_SLOT_ORDER,
  buildTableMealsDetailDays,
  formatMonthValue,
  getTableMealsQueryPeriod,
  parseMonthValue,
  toMealSlotRows,
} from './tableMealsView'

/** 거래처 계정(user_type 3)은 자기 거래처만 본다. 본사는 고른 거래처를 localStorage에도 남겨 다른 화면과 맞춘다. */
const isAccountUser = () => localStorage.getItem('user_type') === '3'

/**
 * 저장된 식단표 조회(거래처 → 월 → 주 식단표 → 요일·식사별 메뉴). 모바일 식단표 화면이 쓴다.
 * 선택 거래처는 기존 화면들과 같이 account_id 쿼리와 localStorage를 함께 본다.
 */
export function useTableMealsView() {
  const [searchParams] = useSearchParams()
  const [accountId, setAccountIdState] = useState(() => searchParams.get('account_id') || localStorage.getItem('account_id') || '')
  const [month, setMonth] = useState(() => formatMonthValue(new Date()))
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountError, setAccountError] = useState('')
  // 조회 결과는 조회 조건(key)과 함께 둔다. 조건이 바뀌면 key가 달라져 이전 결과는 바로 안 보이고, 로딩 여부도 key로 계산한다.
  const [slotsResult, setSlotsResult] = useState<{ key: string; items: AccountMealSlot[] }>({ key: '', items: [] })
  const [tablesResult, setTablesResult] = useState<{ key: string; items: TableMealsItem[]; error: string }>({ key: '', items: [], error: '' })
  const [selectedTable, setSelectedTable] = useState<TableMealsItem | null>(null)
  const [detailResult, setDetailResult] = useState<{ key: string; items: TableMealsDetailItem[]; error: string }>({ key: '', items: [], error: '' })

  useEffect(() => {
    let alive = true
    getAccountOptions()
      .then(items => { if (alive) { setAccounts(items); setAccountError('') } })
      .catch(error => { if (alive) setAccountError(error instanceof Error ? error.message : '거래처 목록을 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!accountId) return
    let alive = true
    getAccountMealSlots(accountId)
      .then(items => { if (alive) setSlotsResult({ key: accountId, items }) })
      .catch(() => { if (alive) setSlotsResult({ key: accountId, items: [] }) })
    return () => { alive = false }
  }, [accountId])

  const tablesKey = accountId ? `${accountId}|${month}` : ''
  useEffect(() => {
    if (!tablesKey) return
    let alive = true
    const { year, month: monthNumber } = parseMonthValue(month)
    getTableMealsList(accountId, year, monthNumber)
      .then(items => { if (alive) setTablesResult({ key: tablesKey, items, error: '' }) })
      .catch(error => { if (alive) setTablesResult({ key: tablesKey, items: [], error: error instanceof Error ? error.message : '식단표 목록을 불러오지 못했습니다.' }) })
    return () => { alive = false }
  }, [accountId, month, tablesKey])

  const tablesReady = tablesKey !== '' && tablesResult.key === tablesKey
  const tables = useMemo(() => tablesReady ? tablesResult.items : [], [tablesReady, tablesResult])
  /** 고른 식단표가 지금 목록에 없으면 오늘이 든 주(없으면 첫 주)를 고른 것으로 본다 */
  const effectiveTable = useMemo(() => {
    if (selectedTable && tables.some(item => item.table_id === selectedTable.table_id)) return selectedTable
    const today = new Date().toLocaleDateString('sv-SE')
    return tables.find(item => { const period = getTableMealsQueryPeriod(item, month); return period.start_date <= today && today <= period.end_date }) || tables[0] || null
  }, [tables, selectedTable, month])

  const detailKey = effectiveTable ? `${effectiveTable.table_id}|${month}` : ''
  useEffect(() => {
    if (!effectiveTable) return
    let alive = true
    getTableMealsDetailList(effectiveTable.account_id || accountId, effectiveTable.table_id, getTableMealsQueryPeriod(effectiveTable, month))
      .then(items => { if (alive) setDetailResult({ key: detailKey, items, error: '' }) })
      .catch(error => { if (alive) setDetailResult({ key: detailKey, items: [], error: error instanceof Error ? error.message : '식단표 상세를 불러오지 못했습니다.' }) })
    return () => { alive = false }
  }, [accountId, month, effectiveTable, detailKey])

  const mealSlots = useMemo(() => slotsResult.key === accountId ? slotsResult.items : [], [slotsResult, accountId])
  const tablesError = tablesReady ? tablesResult.error : ''
  const isTablesLoading = tablesKey !== '' && !tablesReady
  const detailReady = detailKey !== '' && detailResult.key === detailKey
  const detailItems = useMemo(() => detailReady ? detailResult.items : [], [detailReady, detailResult])
  const detailError = detailReady ? detailResult.error : ''
  const isDetailLoading = detailKey !== '' && !detailReady

  const detailDays = useMemo(() => buildTableMealsDetailDays(detailItems), [detailItems])
  /** 거래처에 설정된 식사(없으면 상세에 실제로 있는 식사 코드)만 순서대로 */
  const slotRows = useMemo(() => {
    const configured = toMealSlotRows(mealSlots)
    if (configured.length > 0) return configured
    // 식사 코드(0~8)가 아니라 글자(중식·저녁 등)로 저장된 옛 식단은 PC 상세와 같은 기본 식사 순서로 묶인다
    const candidates = [...ACCOUNT_MEAL_SLOT_ROWS, ...DETAIL_MEAL_SLOT_ORDER.filter(row => row.id !== 'snack-evening')]
    return candidates.filter(row => detailDays.some(day => (day.meals[row.key] || []).length > 0))
  }, [mealSlots, detailDays])

  const setAccountId = (value: string) => {
    if (isAccountUser()) return
    setAccountIdState(value)
    setSelectedTable(null)
    if (value) localStorage.setItem('account_id', value)
  }
  const shiftMonth = (delta: number) => {
    const { year, month: monthNumber } = parseMonthValue(month)
    setMonth(formatMonthValue(new Date(year, monthNumber - 1 + delta, 1)))
    setSelectedTable(null)
  }
  const accountName = accounts.find(option => option.value === accountId)?.text || localStorage.getItem('account_name') || ''

  return {
    accountId, setAccountId, canChangeAccount: !isAccountUser(), accounts, accountError, accountName,
    month, shiftMonth, tables, tablesError, isTablesLoading,
    selectedTable: effectiveTable, setSelectedTable, detailDays, detailItems, slotRows, detailError, isDetailLoading,
  }
}
