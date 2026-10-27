import { useEffect, useState, type HTMLAttributes } from 'react'
import { buildApiUrl } from '../../config/api'

type Recommendation = { menu_id: string; menu_name: string; reasons: string[] }
type RecommendationResult = { key: string; items: Recommendation[]; error: string }
/** recipeProps: 우클릭(레시피 보기) 등 메뉴 줄에 붙일 핸들러 */
export default function MenuRecommendations({ accountId, mealDate, onSelect, disabled, recipeProps }: { accountId: string; mealDate?: string; onSelect: (id: string) => void; disabled: boolean; recipeProps?: (item: Recommendation) => HTMLAttributes<HTMLElement> }) {
  const date = mealDate || new Date().toLocaleDateString('sv-SE')
  // 요청 조건(거래처+식단일)별로 결과를 보관해, 조건이 바뀌면 이전 결과가 자동으로 가려지게 한다
  const requestKey = accountId ? `${accountId}|${date}` : ''
  const [result, setResult] = useState<RecommendationResult>({ key: '', items: [], error: '' })
  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    const query = new URLSearchParams({ account_id: accountId, user_id: localStorage.getItem('user_id') || '', meal_date: date })
    void fetch(buildApiUrl(`/v2/discovery/menus?${query}`), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('추천 메뉴를 불러오지 못했습니다.')
      setResult({ key: requestKey, items: await response.json(), error: '' })
    }).catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, items: [], error: error.message }) })
    return () => controller.abort()
  }, [accountId, date, requestKey])
  const { items, error } = result.key === requestKey ? result : { items: [], error: '' }
  return <section className="meal-recommendations" aria-label="추천 메뉴"><strong>추천 메뉴</strong><p>즐겨찾기와 사용 이력을 참고하고 최근 반복을 줄인 후보입니다.</p>{error && <p role="status">{error}</p>}
    {items.slice(0, 8).map(item => <button type="button" key={item.menu_id} {...recipeProps?.(item)} disabled={disabled} onClick={() => onSelect(item.menu_id)} title={item.reasons.join(' · ')}><strong>{item.menu_name}</strong><small>{item.reasons.join(' · ')}</small></button>)}
    {!error && !items.length && <p>등록된 거래처 메뉴가 있으면 추천이 표시됩니다.</p>}
  </section>
}
