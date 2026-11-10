import { useEffect, useRef, useState } from 'react'
import { HOME_FONTS, type HomeFont } from '../features/home/homeFont'

/** 새 홈 글꼴 시험용 임시 선택기 — 목록·기억은 features/home/homeFont.ts */
export default function FontPicker({ value, onChange }: { value: HomeFont; onChange: (font: HomeFont) => void }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false) }
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="font-picker" ref={boxRef}>
      {open ? <div className="font-picker__menu" role="radiogroup" aria-label="홈 글꼴 고르기(시험용)">
        <strong className="font-picker__title">글꼴 고르기 <small>시험용</small></strong>
        {HOME_FONTS.map(item => (
          <label key={item.key} className={`font-picker__option${value === item.key ? ' is-on' : ''}`} data-font={item.key}>
            <input type="radio" name="home-font" checked={value === item.key} onChange={() => onChange(item.key)} />
            <span className="font-picker__sample">{item.label}<small>{item.note} · 가나다 123</small></span>
          </label>
        ))}
      </div> : null}
      <button type="button" className="quick-links__btn font-picker__btn" aria-expanded={open} aria-label="글꼴 고르기(시험용)" title="글꼴 고르기(시험용)"
        onClick={() => setOpen(value => !value)}>
        <span aria-hidden="true">가</span>
      </button>
    </div>
  )
}
