import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import './MenuCostMissing.css'

/** 서버 원가 사유('쌀: 단가 미등록, 소금: 단가 미등록' 또는 '레시피 없음')를 줄로 나눈다. 같은 사유면 식재료 이름만 */
function reasonLines(reason?: string) {
  return (reason ?? '').split(/,\s*/).map(part => part.trim()).filter(Boolean)
    .map(part => {
      const at = part.indexOf(':')
      if (at < 0) return part
      const name = part.slice(0, at).trim(), note = part.slice(at + 1).trim()
      return note === '단가 미등록' ? name : `${name} · ${note}`
    })
}

/**
 * 식단표 편집 칸의 '원가 미산정' + 빨간 !(2026-10-28 사용자 요청: 사유 글은 숨기고 !를 누르면 단가 미등록 식재료).
 * 칸 전체가 버튼이라 안쪽은 span role=button이고, 누름·길게 누름이 칸 선택·레시피 메뉴로 번지지 않게 막는다.
 */
export default function MenuCostMissing({ reason }: { reason?: string }) {
  // 열린 위치(화면 기준). 칸(버튼) 안에 두면 옆 칸에 가리거나 잘려서 body에 띄운다(2026-10-28)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const open = pos !== null
  const ref = useRef<HTMLSpanElement>(null)
  const alertRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const lines = reasonLines(reason)
  const allPrice = (reason ?? '').split(/,\s*/).filter(Boolean).every(part => part.includes('단가 미등록'))

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !popRef.current?.contains(target)) setPos(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPos(null) }
    // 고정 위치라 칸이 스크롤되면 어긋나므로 닫는다
    const scroll = () => setPos(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll)
    }
  }, [open])

  const stop = (event: SyntheticEvent) => event.stopPropagation()
  const toggle = (event: SyntheticEvent) => {
    event.preventDefault(); event.stopPropagation()
    if (open) { setPos(null); return }
    const rect = alertRef.current?.getBoundingClientRect()
    if (!rect) return
    // 오른쪽·아래 끝에서도 화면 안에(팝업 최대 240px 폭)
    setPos({ top: Math.min(rect.bottom + 4, window.innerHeight - 160), left: Math.max(8, Math.min(rect.left - 6, window.innerWidth - 248)) })
  }

  return (
    <span className="menu-cost-missing" ref={ref}>
      원가 미산정
      {lines.length > 0 ? (
        <span ref={alertRef} role="button" tabIndex={0} className="menu-cost-missing__alert" aria-label="원가를 못 낸 이유 보기" aria-expanded={open}
          onClick={toggle} onPointerDown={stop} onMouseDown={stop} onContextMenu={stop}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') toggle(event) }}>!</span>
      ) : null}
      {pos ? createPortal(
        <span ref={popRef} className="menu-cost-missing__pop" role="dialog" aria-label="원가를 못 낸 이유" style={{ top: pos.top, left: pos.left }}
          onClick={stop} onPointerDown={stop} onMouseDown={stop} onContextMenu={stop}>
          <b>{allPrice ? `단가 미등록 식재료 ${lines.length}개` : '원가를 못 낸 이유'}</b>
          <span className="menu-cost-missing__list">{lines.map(line => <span key={line}>{line}</span>)}</span>
        </span>, document.body) : null}
    </span>
  )
}
