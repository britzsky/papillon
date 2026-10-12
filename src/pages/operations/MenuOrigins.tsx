import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'

type Origin = { menu_id: string; ingredient_id: string; ingredient_name: string; origin_name: string }
export default function MenuOrigins({ accountId, menuIds, tableId }: { accountId: string; menuIds: string[]; tableId?: string }) {
  return <OriginContent key={`${accountId}-${tableId || "current"}`} accountId={accountId} menuIds={menuIds} tableId={tableId} />
}
function OriginContent({ accountId, menuIds, tableId }: { accountId: string; menuIds: string[]; tableId?: string }) {
  const [rows, setRows] = useState<Origin[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(accountId))
  useEffect(() => {
    const controller = new AbortController()
    if (!accountId) return
    void fetch(buildApiUrl(`${tableId ? "/v2/meal-plans/origins" : "/v2/menu-management/origins"}?${new URLSearchParams({ account_id: accountId, ...(tableId ? { table_id: tableId } : {}) })}`), { signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok || !Array.isArray(data)) throw new Error(data.message || '원산지 조회 실패'); return data as Origin[] })
      .then(setRows).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accountId, tableId])
  const selected = rows.filter(r => menuIds.includes(r.menu_id))
  const lines = [...new Set(selected.map(r => `${r.ingredient_name}: ${r.origin_name || '원산지 미확인'}`))]
  const missing = menuIds.some(id => !selected.some(r => r.menu_id === id))
  // 식자재가 많으면 카드가 끝없이 커져 날짜별 식단 칸을 밀어내므로, 목록은 여러 열 + 고정 높이 안에서 스크롤한다(인쇄 시 전체 표시)
  return <section className="table-meals-origin-card"><strong>원산지 · {tableId ? "저장 당시 / 실제 사용 재고 기준" : "현재 연결 식자재 기준"}{lines.length ? ` (${lines.length}건)` : ''}</strong>
    {loading ? <p>원산지를 확인하는 중입니다.</p> : error ? <p role="alert">{error}</p> : <>
      {lines.length > 0 && <div className="table-meals-origin-card__list">{lines.map(line => <span key={line}>{line}</span>)}</div>}
      {missing && <p>일부 메뉴의 식자재·원산지 정보가 없습니다. 확인이 필요합니다.</p>}{!menuIds.length && <p>메뉴를 선택하면 식자재 원산지가 표시됩니다.</p>}</>}
  </section>
}
