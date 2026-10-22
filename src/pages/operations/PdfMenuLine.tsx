import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { MenuManagerItem } from '../../api/operations'
import './PdfMenuLine.css'

/**
 * 식단표(PDF·엑셀·자동) 결과의 메뉴 한 줄. 메뉴는 글자로만 보여 주고, 할 수 있는 일(추천·등록·제외·연결 해제)은
 * 줄을 눌렀을 때 뜨는 작은 창에 모은다 — 메뉴와 기능 버튼이 같은 모양으로 섞여 보이지 않게(2026-10-21 사용자 요청).
 */
type Props = {
  text: string
  matchedMenu: MenuManagerItem | null
  excluded?: boolean
  /** 메뉴명과 다른 표기로 연결된 경우의 출처: 저장된 연결(alias) / 이번에 고름(picked) */
  linkSource?: 'alias' | 'picked'
  shortage?: boolean
  open: boolean
  onToggle: (open: boolean) => void
  /** 등록된 메뉴 이름에 붙일 동작(길게 눌러 AI 조리법 등) */
  nameProps?: HTMLAttributes<HTMLButtonElement>
  onShowDetail?: () => void
  /** 미등록 메뉴 처리 */
  similar?: MenuManagerItem[]
  budgetPicks?: MenuManagerItem[]
  remainingBudget?: number
  onPick?: (menu: MenuManagerItem) => void
  onRegister?: () => void
  onExclude?: () => void
  onRestore?: () => void
  /** 저장된 연결을 이번만 쓰지 않거나, 이번에 고른 연결을 취소 */
  onUnlink?: () => void
}

/** 식사 칸 머리의 1인분 열량: 좁은 칸에서도 한 줄. 자세한 내용은 마우스를 올리면 */
export function SlotCalories({ menus }: { menus: ({ calories_per_serving?: number } | null)[] }) {
  if (!menus.length) return null
  const known = menus.map(menu => Number(menu?.calories_per_serving)).filter(value => Number.isFinite(value) && value > 0)
  const missing = menus.length - known.length
  const total = Math.round(known.reduce((sum, value) => sum + value, 0))
  const label = known.length ? `${total.toLocaleString('ko-KR')} kcal${missing ? ` +${missing}` : ''}` : '열량 미등록'
  const title = known.length ? `등록된 메뉴 1인분 합계 ${total.toLocaleString('ko-KR')} kcal${missing ? ` · 열량 미등록 ${missing}개 메뉴 제외` : ''}` : '열량이 등록된 메뉴가 없습니다'
  return <span className="pdf-slot__kcal" title={title}>{label}</span>
}

const won = (menu: MenuManagerItem) => {
  const cost = Number(menu.menu_cost_per_person)
  return cost > 0 ? `${cost.toLocaleString('ko-KR')}원` : ''
}

export default function PdfMenuLine(props: Props) {
  const { text, matchedMenu, excluded, linkSource, shortage, open, onToggle } = props
  const anchorRef = useRef<HTMLLIElement | null>(null)

  if (excluded) {
    return (
      <li className="pdf-line is-excluded">
        <s>{text}</s>
        {props.onRestore && <button type="button" className="pdf-line__link" onClick={props.onRestore}>되돌리기</button>}
      </li>
    )
  }

  if (matchedMenu) {
    const showSource = Boolean(linkSource && props.onUnlink)
    return (
      <li ref={anchorRef} className={`pdf-line is-matched${shortage ? ' is-shortage' : ''}`}>
        <button type="button" className="pdf-line__name" {...props.nameProps} onClick={props.onShowDetail}>{matchedMenu.menu_name}</button>
        {shortage && <span className="pdf-line__tag is-shortage">재고 부족</span>}
        {showSource && (
          <button type="button" className="pdf-line__source" aria-expanded={open} onClick={() => onToggle(!open)} title="표기와 연결 바꾸기">
            표기 '{text}'
          </button>
        )}
        {open && showSource && (
          <LinePopover anchor={anchorRef} onClose={() => onToggle(false)} title={`표기 '${text}'`}>
            <p className="pdf-pop__note">메뉴 '{matchedMenu.menu_name}'(으)로 {linkSource === 'alias' ? '저장된 연결에 따라' : '이번에 골라'} 연결했습니다.</p>
            <div className="pdf-pop__actions">
              <button type="button" className="pdf-pop__secondary" onClick={() => { props.onUnlink?.(); onToggle(false) }}>
                {linkSource === 'alias' ? '이번만 다른 메뉴로' : '선택 취소'}
              </button>
            </div>
          </LinePopover>
        )}
      </li>
    )
  }

  const similar = props.similar ?? []
  const budgetPicks = (props.budgetPicks ?? []).filter(menu => !similar.some(item => item.menu_id === menu.menu_id))
  return (
    <li ref={anchorRef} className={`pdf-line is-unmatched${open ? ' is-open' : ''}`}>
      <button type="button" className="pdf-line__name" aria-expanded={open} aria-label={`${text} (미등록 — 눌러서 추천·등록·제외)`} title="미등록 — 눌러서 추천·등록·제외" onClick={() => onToggle(!open)}>
        {text}
      </button>
      {open && (
        <LinePopover anchor={anchorRef} onClose={() => onToggle(false)} title={`'${text}' 처리`}>
          <p className="pdf-pop__note">본사 메뉴에 없는 표기입니다. 아래에서 하나를 고르세요.</p>
          {similar.length > 0 && (
            <section>
              <h4>이름이 비슷한 본사 메뉴로 바꾸기</h4>
              <ul className="pdf-pop__list">
                {similar.map(menu => (
                  <li key={menu.menu_id}><button type="button" onClick={() => { props.onPick?.(menu); onToggle(false) }}><span>{menu.menu_name}</span><small>{won(menu)}</small></button></li>
                ))}
              </ul>
            </section>
          )}
          {props.remainingBudget != null && (
            <section>
              <h4>남은 식단가({Math.max(0, props.remainingBudget).toLocaleString('ko-KR')}원) 안의 메뉴로 바꾸기</h4>
              {budgetPicks.length ? (
                <ul className="pdf-pop__list">
                  {budgetPicks.map(menu => (
                    <li key={menu.menu_id}><button type="button" onClick={() => { props.onPick?.(menu); onToggle(false) }}><span>{menu.menu_name}</span><small>{won(menu)}</small></button></li>
                  ))}
                </ul>
              ) : <p className="pdf-pop__empty">식단가 안에 맞는 본사 메뉴가 없습니다.</p>}
            </section>
          )}
          {!similar.length && props.remainingBudget == null && <p className="pdf-pop__empty">이름이 비슷한 본사 메뉴가 없습니다.</p>}
          <div className="pdf-pop__actions">
            <button type="button" className="pdf-pop__primary" onClick={() => { props.onRegister?.(); onToggle(false) }}>새 메뉴로 등록</button>
            <button type="button" className="pdf-pop__secondary" onClick={() => { props.onExclude?.(); onToggle(false) }} title="행사·안내 문구처럼 메뉴가 아닌 글자">메뉴 아님 · 이번만 제외</button>
          </div>
        </LinePopover>
      )}
    </li>
  )
}

/** 줄 아래에 뜨는 작은 창. 표 칸 스크롤에 잘리지 않게 body에 띄우고, 바깥을 누르거나 Esc면 닫는다 */
function LinePopover({ anchor, title, onClose, children }: { anchor: RefObject<HTMLLIElement | null>; title: string; onClose: () => void; children: ReactNode }) {
  const popRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      const pop = popRef.current
      if (!rect || !pop) return
      const width = Math.min(320, window.innerWidth - 16)
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
      const below = rect.bottom + 4
      const top = below + pop.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - pop.offsetHeight - 4) : below
      setStyle({ position: 'fixed', top, left, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor])

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popRef.current?.contains(target) || anchor.current?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [anchor, onClose])

  return createPortal(
    <div ref={popRef} className="pdf-pop" role="dialog" aria-label={title} style={style}>
      <strong className="pdf-pop__title">{title}</strong>
      {children}
    </div>,
    document.body,
  )
}
