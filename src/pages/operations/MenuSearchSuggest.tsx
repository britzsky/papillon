import { useMemo, useRef, useState } from 'react'
import type { MenuManagerItem } from '../../api/operations'
import { MANUAL_FOOD_TYPE_OPTIONS, MANUAL_MENU_TYPE_OPTIONS, getMenuFoodTypeCode, normalizeMenuText } from '../../features/tableMeals/useTableMealsWorkspace'

const SUGGEST_LIMIT = 12

const foodLabel = (menu: MenuManagerItem) => MANUAL_FOOD_TYPE_OPTIONS.find(option => option.value === String(getMenuFoodTypeCode(menu)))?.label ?? '기타'
const typeLabel = (menu: MenuManagerItem) => MANUAL_MENU_TYPE_OPTIONS.find(option => option.value === menu.menu_type)?.label ?? '기타'

/**
 * 식단표 수정 '메뉴 추가' 검색칸 + 연관 메뉴 목록(2026-11-25 사용자 요청).
 * 음식 분류·메뉴 유형 필터와 상관없이 이름이 맞는 메뉴를 전부 보여 주고(분류·유형 칩 함께),
 * 하나를 고르면 그 메뉴의 분류·유형으로 필터를 바꾸고 검색어를 메뉴 이름으로 채운다.
 * menus: 필터 전 메뉴(식단 유형만 맞춘 것).
 */
export default function MenuSearchSuggest({ value, onChange, menus, onPick }: {
  value: string
  onChange: (value: string) => void
  menus: MenuManagerItem[]
  onPick: (menu: MenuManagerItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const suggestions = useMemo(() => {
    const query = normalizeMenuText(value)
    if (!query) return []
    const hits = menus.filter(menu => normalizeMenuText(menu.menu_name).includes(query))
    // 이름이 검색어로 시작하는 메뉴 먼저, 그다음 짧은 이름
    hits.sort((a, b) => {
      const an = normalizeMenuText(a.menu_name), bn = normalizeMenuText(b.menu_name)
      return Number(!an.startsWith(query)) - Number(!bn.startsWith(query)) || an.length - bn.length || a.menu_name.localeCompare(b.menu_name, 'ko')
    })
    return hits
  }, [menus, value])

  const shown = suggestions.slice(0, SUGGEST_LIMIT)
  const pick = (menu: MenuManagerItem) => { onPick(menu); setOpen(false); setActive(-1) }

  return <div className="menu-suggest" ref={boxRef}
    onBlur={event => { if (!boxRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <input
      value={value}
      aria-label="추가할 메뉴 검색"
      placeholder="메뉴 이름으로 검색 (분류와 상관없이 찾아요)"
      role="combobox"
      aria-expanded={open && shown.length > 0}
      aria-autocomplete="list"
      onFocus={() => setOpen(true)}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1) }}
      onKeyDown={event => {
        if (!open || shown.length === 0) return
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % shown.length) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index <= 0 ? shown.length - 1 : index - 1)) }
        else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); pick(shown[active]) }
        else if (event.key === 'Escape') { setOpen(false); setActive(-1) }
      }}
    />
    {open && shown.length > 0 ? <div className="menu-suggest__list" role="listbox" aria-label="연관 메뉴">
      <p className="menu-suggest__head">전체 분류에서 {suggestions.length.toLocaleString('ko-KR')}개{suggestions.length > SUGGEST_LIMIT ? ` 중 ${SUGGEST_LIMIT}개` : ''} · 고르면 필터도 그 분류로 바뀌어요</p>
      {shown.map((menu, index) => <button key={menu.menu_id} type="button" role="option" aria-selected={index === active}
        className={`menu-suggest__item${index === active ? ' is-active' : ''}`}
        onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => pick(menu)}>
        <span className="menu-suggest__name">{menu.menu_name}</span>
        <span className="menu-suggest__chips">
          <span className="menu-suggest__chip is-food">{foodLabel(menu)}</span>
          <span className="menu-suggest__chip is-type">{typeLabel(menu)}</span>
        </span>
      </button>)}
    </div> : null}
  </div>
}
