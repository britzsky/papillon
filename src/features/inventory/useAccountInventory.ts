import { useEffect, useState } from 'react'
import { getAccountInventoryList, saveAccountInventory, type AccountInventoryItem } from '../../api/inventory'

/**
 * 거래처 재고 목록 조회·한 상품 재고 수정(터치 화면). PC 화면은 표 편집(여러 행 저장) 때문에 자체 상태를 쓰고,
 * 위치·상태·검색 규칙은 inventoryView를 같이 쓴다.
 */
export function useAccountInventory(accountId: string) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; items: AccountInventoryItem[]; error: string }>({ key: '', items: [], error: '' })
  const key = accountId ? `${accountId}|${revision}` : ''

  useEffect(() => {
    if (!key) return
    let alive = true
    getAccountInventoryList(accountId)
      .then(items => { if (alive) setResult({ key, items, error: '' }) })
      .catch(error => { if (alive) setResult({ key, items: [], error: error instanceof Error ? error.message : '거래처 재고 목록을 불러오지 못했습니다.' }) })
    return () => { alive = false }
  }, [accountId, key])

  // 새로고침 중에는 이전 목록을 그대로 보여준다(같은 거래처일 때)
  const sameAccount = result.key.startsWith(`${accountId}|`)
  const items = sameAccount ? result.items : []
  const error = result.key === key ? result.error : ''
  const isLoading = key !== '' && result.key !== key

  /** 한 상품의 현재고·단위·보관위치를 바꾼다(PC 표의 한 행 저장과 같은 API) */
  const saveItem = async (item: AccountInventoryItem, changes: Pick<AccountInventoryItem, 'current_qty' | 'current_unit' | 'location_id'>) => {
    await saveAccountInventory({ account_id: accountId, inventory_items: [{ ...item, ...changes }] })
    setRevision(value => value + 1)
  }

  return { items, error, isLoading, reload: () => setRevision(value => value + 1), saveItem }
}
