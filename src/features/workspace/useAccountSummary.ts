import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'

/** 서버 /v2/workspace/account-summary — 홈 오른쪽 거래처 카드(담당자·이달 예산/사용/여유) */
export type AccountSummary = {
  account_id: string; month: string; account_name: string | null; user_name: string | null
  manager_name: string | null; manager_tel: string | null
  /** 기존 ERP 예산관리의 이번 달 실 예산 부여 합계(없으면 예산부여). 미등록이면 null */
  budget: number | null; budget_source: string
  /** 이번 달 납품분 접수·입고 품목 금액 + 직접구매 */
  used: number; used_orders: number; used_direct: number; remaining: number | null
}

export function useAccountSummary(accountId: string) {
  const [result, setResult] = useState<{ id: string; data: AccountSummary | null } | null>(null)
  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    fetch(buildApiUrl(`/v2/workspace/account-summary?${new URLSearchParams({ account_id: accountId })}`), { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<AccountSummary> : null)
      .then(data => { if (!controller.signal.aborted) setResult({ id: accountId, data }) })
      .catch(() => { if (!controller.signal.aborted) setResult({ id: accountId, data: null }) })
    return () => controller.abort()
  }, [accountId])
  return result?.id === accountId ? result.data : null
}
