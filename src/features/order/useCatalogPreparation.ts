import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../../config/api'

export type CatalogSupplier = { supplier_code: string; supplier_name: string; status: string; message?: string; last_succeeded_at?: string }
type Result = { suppliers: CatalogSupplier[] }

export const preparationLabel = (status: string) => status === 'READY' ? '준비 완료' : status === 'PREPARING' ? '준비 중' : '확인 필요'

/**
 * 납품일별 공급사 상품·가격 준비(POST로 시작, 준비 중이면 3초마다 최대 60번 상태 확인). 하나라도 준비되면 onReady.
 * PC CatalogPreparation과 터치 발주하기 공용.
 */
export function useCatalogPreparation(accountId: string, date: string, onReady?: () => void) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const ready = useRef(onReady)
  useEffect(() => { ready.current = onReady }, [onReady])
  useEffect(() => {
    if (!accountId || !date) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const read = async (start: boolean) => {
      try {
        const response = await fetch(buildApiUrl('/v2/supplier-integration/preparation' + (start ? '' : '?' + new URLSearchParams({ account_id: accountId, delivery_date: date }))), {
          method: start ? 'POST' : 'GET', signal: controller.signal,
          ...(start ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: accountId, delivery_date: date }) } : {}),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || '상품 준비 상태 확인 실패')
        if (controller.signal.aborted) return
        setResult(data); setError('')
        if (data.suppliers.some((s: CatalogSupplier) => s.status === 'PREPARING')) {
          if (++attempts < 60) timer = setTimeout(() => void read(false), 3000)
          else setError('상품 준비가 계속 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.')
        } else if (data.suppliers.some((s: CatalogSupplier) => s.status === 'READY')) ready.current?.()
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '상품 준비 실패') }
    }
    void read(true)
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [accountId, date, retry])

  const needsRetry = Boolean(error) || Boolean(result?.suppliers.some(s => s.status !== 'READY'))
  return { result, error, needsRetry, retry: () => setRetry(n => n + 1) }
}
