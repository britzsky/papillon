import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './ImageZoom.css'

export default function ImageZoom({ src, fallbackSrc, name, children }: {
  src: string; fallbackSrc?: string; name: string; children: ReactNode
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [failedSources, setFailedSources] = useState<string[]>([])
  const trigger = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const id = useId()
  const close = () => { setAnchor(null); trigger.current?.focus({ preventScroll: true }) }

  useEffect(() => {
    if (!anchor) return
    closeButton.current?.focus({ preventScroll: true })
    const dismiss = () => setAnchor(null)
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) dismiss()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismiss()
        trigger.current?.focus({ preventScroll: true })
      }
    }
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return
      dismiss()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [anchor])

  const toggle = () => {
    if (anchor) { close(); return }
    const element = trigger.current?.querySelector('img') || trigger.current
    if (element) { setFailedSources([]); setAnchor(element.getBoundingClientRect()) }
  }
  const margin = 12
  const scale = anchor ? Math.min(10, (window.innerWidth - margin * 2) / anchor.width,
    (window.innerHeight - margin * 2 - 44) / anchor.height) : 1
  const width = anchor ? anchor.width * scale : 0
  const height = anchor ? anchor.height * scale : 0
  const previewSrc = failedSources.includes(src) && fallbackSrc ? fallbackSrc : src

  return <>
    <span ref={trigger} className="image-zoom-trigger" role="button" tabIndex={0}
      aria-label={`${name || '이미지'} 크게 보기`} aria-expanded={Boolean(anchor)} aria-controls={anchor ? id : undefined}
      title="클릭하면 이미지 확대" onClick={(event) => { event.stopPropagation(); toggle() }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggle() }
      }}>
      {children}
    </span>
    {anchor && createPortal(<section ref={panel} id={id} role="dialog" aria-label={`${name || '이미지'} 확대 보기`}
      className="image-zoom-panel" style={{ width, left: Math.max(margin, anchor.left - width - 12),
        top: Math.max(margin, Math.min(anchor.top + anchor.height / 2 - (height + 44) / 2, window.innerHeight - height - 44 - margin)) }}
      onClick={(event) => event.stopPropagation()}>
      <header><span>{name || '이미지'}</span><button ref={closeButton} type="button" onClick={close} aria-label="확대 이미지 닫기">×</button></header>
      {failedSources.includes(previewSrc) ? <div className="image-zoom-error" style={{ height }}>이미지를 불러올 수 없습니다.</div>
        : <img src={previewSrc} alt={`${name || '이미지'} 확대`} style={{ height }} onError={() => setFailedSources((current) => [...current, previewSrc])} />}
    </section>, document.body)}
  </>
}
