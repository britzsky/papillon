import { Children, Fragment, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import TouchIcon from './TouchIcon'
import './TouchSelect.css'

type Option = { value: string; label: string; disabled: boolean }
type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode }

/** <option> 자식(배열·Fragment·조건부 포함)을 목록으로. 글자는 자식의 문자열·숫자를 이어 붙인다 */
function readOptions(children: ReactNode): Option[] {
  const text = (node: ReactNode): string => Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : '').join('')
  const out: Option[] = []
  const walk = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) { walk((child as ReactElement<{ children?: ReactNode }>).props.children); return }
    if (child.type !== 'option') return
    const props = (child as ReactElement<OptionProps>).props
    const label = text(props.children)
    out.push({ value: String(props.value ?? label), label, disabled: Boolean(props.disabled) })
  })
  walk(children)
  return out
}

/**
 * 터치 화면 select(2026-10-27 사용자 요청: 기본 select 목록이 예쁘지 않음). 누르면 아래에서 올라오는 목록 창에서 고른다.
 * 기존 <select>를 태그 이름만 바꿔 쓰도록 <option> 자식과 onChange(e => e.target.value)를 그대로 받는다.
 * 창 제목은 aria-label, 없으면 감싼 <label>의 글자. 항목이 많으면(10개 초과) 검색칸을 보인다.
 */
export default function TouchSelect({ value, onChange, children, disabled = false, className = '', id, title, 'aria-label': ariaLabel }: {
  value: string | number
  onChange: (event: { target: { value: string } }) => void
  children: ReactNode
  disabled?: boolean
  className?: string
  id?: string
  title?: string
  'aria-label'?: string
}) {
  const options = useMemo(() => readOptions(children), [children])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [heading, setHeading] = useState('')
  const button = useRef<HTMLButtonElement | null>(null)
  const current = options.find(option => option.value === String(value))
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter(option => option.label.toLowerCase().includes(q)) : options

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])

  const show = () => {
    // 감싼 label 글자(버튼 글자 제외)를 창 제목으로
    const label = button.current?.closest('label') ?? (id ? document.querySelector(`label[for="${id}"]`) : null)
    const own = button.current?.textContent ?? ''
    setHeading(ariaLabel || (label?.textContent ?? '').replace(own, '').trim() || '선택')
    setQuery('')
    setOpen(true)
  }
  const choose = (option: Option) => {
    if (option.disabled) return
    setOpen(false)
    if (option.value !== String(value)) onChange({ target: { value: option.value } })
    button.current?.focus()
  }

  return <>
    <button ref={button} type="button" id={id} className={`t-select ${className}`.trim()} disabled={disabled} title={title ?? current?.label}
      aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={show}>
      <span className="t-select__value">{current?.label ?? ''}</span>
    </button>
    {/* body로 띄운다: label 안에 두면 창을 누를 때마다 label이 버튼을 다시 누름 */}
    {open && createPortal(<div className="t-sheet-backdrop t-select-backdrop" role="presentation" onClick={e => { e.stopPropagation(); setOpen(false) }}>
      <section className="t-sheet t-select-sheet" role="dialog" aria-modal="true" aria-label={heading} onClick={e => e.stopPropagation()}>
        <header className="t-sheet__head">
          <h2>{heading}</h2>
          {options.length > 10 && <label className="t-chip t-select-search"><TouchIcon name="search" />
            <input type="search" autoFocus placeholder="검색" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { const first = shown.find(option => !option.disabled); if (e.key === 'Enter' && first) choose(first) }} /></label>}
        </header>
        <div className="t-sheet__body">
          <div className="t-select-list" role="listbox" aria-label={heading}>
            {shown.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === String(value)} disabled={option.disabled}
              className={option.value === String(value) ? 'is-selected' : ''} onClick={() => choose(option)}>
              <span>{option.label || '선택 안 함'}</span>
              {option.value === String(value) && <TouchIcon name="check" size={20} />}
            </button>)}
            {!shown.length && <p className="t-msg">검색 결과가 없습니다.</p>}
          </div>
        </div>
        <footer className="t-sheet__actions"><button type="button" className="t-btn" onClick={() => setOpen(false)}>닫기</button></footer>
      </section>
    </div>, document.body)}
  </>
}
