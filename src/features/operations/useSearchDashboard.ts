import { useEffect, useMemo, useState } from 'react'
import { getSearchDashboard, type SearchDashboard } from '../../api/analytics'

const EMPTY: SearchDashboard = { summary: {}, popular_searches: [], no_result_searches: [], intent_summary: [] }
export const INTENT_NAMES: Record<string, string> = { INTEGRATED_SEARCH: '통합검색', MENU_SEARCH: '메뉴', INGREDIENT_SEARCH: '식자재', VENDOR_SEARCH: '사업장', HYGIENE_GUIDE_SEARCH: '위생' }

/** 검색어 분석(PC·터치 공용): 기간별 검색 요약·인기 검색어·결과 없는 검색어·유형 분포 */
export function useSearchDashboard() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(EMPTY)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getSearchDashboard(days).then((result) => { if (active) { setData(result); setError('') } }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '조회 실패') })
    return () => { active = false }
  }, [days])
  const maxPopular = useMemo(() => Math.max(1, ...data.popular_searches.map((item) => Number(item.search_count))), [data])
  const maxIntent = useMemo(() => Math.max(1, ...data.intent_summary.map((item) => Number(item.search_count))), [data])
  return { days, setDays, data, summary: data.summary, error, maxPopular, maxIntent }
}
