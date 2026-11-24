import { useEffect, useState } from 'react'
import { getPending, syncSituations, type PendingResult } from '../../api/receiving'

export const PENDING_LABELS = { CHECK_NEEDED: '결품 확인 필요', SUPPLIER_REPORTED: '웰스토리 미입 등록', WAITING: '배송 대기' } as const

/**
 * 안 들어온 품목(배송 대기·결품 확인 필요·웰스토리 미입 등록) — PC·터치 발주서 화면 공용.
 * 화면을 열 때 웰스토리 상황(읽기 전용)을 한 번 불러오고(서버가 10분에 한 번으로 제한), 발주서 목록이 바뀔 때마다 다시 계산한다.
 */
export function useReceivingPending(accountId: string, refreshKey: unknown) {
  const [pending, setPending] = useState<PendingResult | null>(null)
  const [error, setError] = useState('')
  const [synced, setSynced] = useState(false)
  useEffect(() => {
    if (!accountId) return
    let active = true
    syncSituations(accountId).catch(() => null).finally(() => { if (active) setSynced(true) })
    return () => { active = false }
  }, [accountId])
  useEffect(() => {
    if (!accountId || !synced) return
    let active = true
    getPending(accountId).then(result => { if (active) { setPending(result); setError('') } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : '안 들어온 품목을 불러오지 못했습니다.') })
    return () => { active = false }
  }, [accountId, synced, refreshKey])
  const attention = (pending?.items || []).filter(item => item.state !== 'WAITING')
  return { pending, error, attention }
}
