import { useState } from 'react'
import { undoOrderPreference, type PreferenceChange } from '../api/mixedProcurement'

export default function OrderPreferenceChanges({ accountId, orderId, changes = [] }: {
  accountId: string; orderId: string; changes?: PreferenceChange[]
}) {
  const [busy, setBusy] = useState('')
  const [undone, setUndone] = useState<string[]>([])
  const [error, setError] = useState('')
  const undo = async (item: string) => {
    setBusy(item); setError('')
    try {
      await undoOrderPreference(accountId, orderId, item)
      setUndone(current => [...current, item])
    } catch (cause) { setError(cause instanceof Error ? cause.message : '되돌리기 실패') }
    finally { setBusy('') }
  }
  if (!changes.length) return null
  return <div aria-label="우선 상품 자동 전환">
    {changes.map(change => <p key={change.client_ord_item}>
      {change.undone || undone.includes(change.client_ord_item)
        ? `${change.product_name}: 이전 우선 상품으로 되돌렸습니다.`
        : <>{change.product_name}: 우선 상품으로 자동 전환했습니다.{' '}
          <button type="button" disabled={!!busy} onClick={() => void undo(change.client_ord_item)}>
            {busy === change.client_ord_item ? '처리 중...' : '이전 상품으로 되돌리기'}
          </button></>}
    </p>)}
    {error && <p role="alert">{error}</p>}
  </div>
}
