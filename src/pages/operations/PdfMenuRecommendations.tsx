import { useState } from 'react'
import type { MenuManagerItem } from '../../api/operations'

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
function similarity(a: string, b: string) {
  const left = new Set(Array.from(normalize(a))), right = new Set(Array.from(normalize(b)))
  return [...left].filter(c => right.has(c)).length / Math.max(1, new Set([...left, ...right]).size)
}
export default function PdfMenuRecommendations({ text, menus, remainingBudget, usedIds, onSelect }: {
  text: string; menus: MenuManagerItem[]; remainingBudget: number | undefined; usedIds: string[]; onSelect: (menu: MenuManagerItem) => void
}) {
  const [mode, setMode] = useState<'budget' | 'similar' | null>(null)
  const candidates = remainingBudget == null ? [] : menus.filter(m => !usedIds.includes(m.menu_id)
    && m.menu_cost_complete !== false && Number(m.menu_cost_per_person) > 0
    && Number(m.menu_cost_per_person) <= remainingBudget
    && (mode !== 'similar' || similarity(text, m.menu_name) > 0))
    .sort((a, b) => mode === 'similar' ? similarity(text, b.menu_name) - similarity(text, a.menu_name)
      : Number(a.menu_cost_per_person) - Number(b.menu_cost_per_person)).slice(0, 12)
  return <span className="pdf-menu-recommendations"><button type="button" onClick={() => setMode(mode === 'budget' ? null : 'budget')}>식단가 기준 추천메뉴</button><button type="button" onClick={() => setMode(mode === 'similar' ? null : 'similar')}>비슷한 메뉴추천</button>
    {mode && <span role="region" aria-label={`${text} 대체 메뉴`}>
      {remainingBudget == null ? <small>식사 예산과 이미 선택한 메뉴의 원가를 먼저 확인해주세요.</small> : <><small>식사 잔여 예산 {Math.max(0, remainingBudget).toLocaleString()}원 · 미매칭 메뉴를 모두 선택한 뒤 식사 합계를 확인하세요.</small>{candidates.map(m => <button type="button" key={m.menu_id} onClick={() => onSelect(m)}>{m.menu_name} · {Number(m.menu_cost_per_person).toLocaleString()}원</button>)}{!candidates.length && <small>예산을 충족하는 거래처 메뉴가 없습니다.</small>}</>}
    </span>}
  </span>
}
