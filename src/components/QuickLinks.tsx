import { useEffect, useState, type ReactNode, type RefObject } from 'react'

/** 더채움 SNS(2026-11-09 사용자 지정, 유튜브는 2026-11-10) */
export const INSTAGRAM_URL = 'https://www.instagram.com/thefull_16?obrf=MXF5b2w0NXZwYzhldg=='
export const NAVER_BLOG_URL = 'https://m.blog.naver.com/thefull1999'
export const YOUTUBE_URL = 'https://www.youtube.com/@thechaewoom_22'

/** 이만큼 내려가면 '맨 위로'가 나타난다 */
const SHOW_TOP_AFTER = 240

/**
 * 오른쪽 아래 떠 있는 바로가기: 맨 위로(+ 글꼴 선택기). 인스타그램·블로그는 2026-11-10 사용자 요청으로 머리 줄(HeaderSns)로 옮김.
 * 상단 메뉴 틀은 본문(.top-layout__content)이 스크롤되므로 그 요소를 받아 올린다.
 */
export default function QuickLinks({ scrollRef, children }: { scrollRef: RefObject<HTMLElement | null>; children?: ReactNode }) {
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setShowTop(el.scrollTop > SHOW_TOP_AFTER)
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [scrollRef])

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <nav className="quick-links" aria-label="바로가기">
      {children}
      <button type="button" className={`quick-links__btn is-top${showTop ? '' : ' is-hidden'}`} onClick={toTop} title="맨 위로" aria-label="맨 위로" tabIndex={showTop ? 0 : -1} aria-hidden={!showTop}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6" /></svg>
        <span className="quick-links__top-label" aria-hidden="true">TOP</span>
      </button>
    </nav>
  )
}

/** 머리 줄 검색창 오른쪽 SNS 아이콘(2026-11-10 시안): 유튜브 · 네이버 블로그 · 인스타그램, 모두 새 창 */
export function HeaderSns() {
  return (
    <nav className="header-sns" aria-label="더채움 SNS">
      <a className="header-sns__link is-youtube" href={YOUTUBE_URL} target="_blank" rel="noopener noreferrer" title="더채움 유튜브" aria-label="더채움 유튜브 (새 창)">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="1.5" y="5" width="21" height="14" rx="4.2" fill="currentColor" /><path d="M10 9v6l5.2-3z" fill="#fff" />
        </svg>
      </a>
      <a className="header-sns__link is-blog" href={NAVER_BLOG_URL} target="_blank" rel="noopener noreferrer" title="더채움 네이버 블로그" aria-label="더채움 네이버 블로그 (새 창)">
        <span aria-hidden="true">b</span>
      </a>
      <a className="header-sns__link is-instagram" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" title="더채움 인스타그램" aria-label="더채움 인스타그램 (새 창)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </a>
    </nav>
  )
}
