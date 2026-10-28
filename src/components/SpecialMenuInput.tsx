import { useState } from 'react'
import type { MenuManagerItem } from '../api/operations'
import { normalizeMenuText } from '../features/tableMeals/useTableMealsWorkspace'
import './SpecialMenuInput.css'

/** 특식 메뉴 이름 추천 목록. 칸마다 수천 개를 그리지 않게 화면에 한 번만 둔다 */
export function SpecialMenuDatalist({ id, menus }: { id: string; menus: MenuManagerItem[] }) {
  return <datalist id={id}>{menus.map(menu => <option key={menu.menu_id} value={menu.menu_name} />)}</datalist>
}

/**
 * 주간 식사 설정의 '특식' 칸(2026-10-27 사용자 요청: 어떤 날 한 끼에 메뉴 하나를 특식으로).
 * 이름을 치면 추천 목록(SpecialMenuDatalist)에서 고르고, 목록의 이름과 같아지면 그 메뉴로 정한다. 비우면 특식 없음.
 */
export default function SpecialMenuInput({ listId, menus, menuId, menuName, label, onChange, className = '' }: {
  listId: string
  menus: MenuManagerItem[]
  menuId?: string
  menuName?: string
  label: string
  onChange: (menu: MenuManagerItem | null) => void
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? menuName ?? ''
  const pending = text !== null && text.trim() !== '' && text !== menuName

  const change = (value: string) => {
    setText(value)
    if (!value.trim()) { onChange(null); setText(null); return }
    const key = normalizeMenuText(value)
    const menu = menus.find(item => normalizeMenuText(item.menu_name) === key)
    if (menu) { onChange(menu); setText(null) }
  }

  return <label className={`special-menu-input${menuId ? ' is-set' : ''}${pending ? ' is-pending' : ''} ${className}`.trim()} title={pending ? '목록에 있는 메뉴 이름을 골라주세요' : undefined}>
    <span aria-hidden="true">★</span>
    <input list={listId} aria-label={label} value={shown} placeholder="특식 없음" onChange={e => change(e.target.value)} onBlur={() => setText(null)} />
    {menuId ? <button type="button" aria-label={`${label} 지우기`} onClick={() => change('')}>×</button> : null}
  </label>
}
