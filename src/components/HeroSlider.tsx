import { useCallback, useEffect, useState, type ReactNode } from 'react'
import './HeroSlider.css'

/** curves: 로고 색 곡선을 그 장 위에 그림(기본 true, 자체 디자인이 있는 장은 false) */
export type HeroSlide = { key: string; label: string; content: ReactNode; curves?: boolean }

/** 슬라이드 최대 장수 5(2026-11-09 사용자 지정). 2026-11-10 회사 유니폼 사진 장을 빼서 더채움몰 + 기사 4 = 5장 */
export const MAX_SLIDES = 5
/** 자동 넘김 간격 */
const INTERVAL_MS = 6000

const ORANGE = '#F29A2E'
const BLUE = '#1E98CF'
const GREEN = '#5A9A3C'

/**
 * 로고 색(주황·파랑·초록) 곡선(2026-11-10 시안을 확대해 비율을 옮김). 장식이라 화면 읽기에서 뺀다.
 * 좌표는 시안 틀 기준(슬라이드 1000×486, 배너 1000×168)이고 viewBox는 곡선이 있는 부분만 잘라 높이 비율(CSS)로 크기를 맞춘다 — 원 모양이 찌그러지지 않게.
 * slide: 왼쪽 위(파란 큰 원 · 오른쪽 주황 초승달 · 아래 초록) + 오른쪽 아래(주황 · 파랑 · 오른쪽 끝 초록).
 * banner: 홈 E 배너 오른쪽 아래(뒤 주황 · 파랑 · 앞 초록).
 */
export function BrandCurves({ variant = 'slide' }: { variant?: 'slide' | 'banner' }) {
  if (variant === 'banner') return (
    <svg className="brand-curve is-banner" viewBox="820 85 180 83" aria-hidden="true">
      <path d="M826 168C858 135 900 114 952 109H1000V168Z" fill={ORANGE} />
      <path d="M912 145C935 112 962 95 1000 87V168H912Z" fill={BLUE} />
      <path d="M872 168C905 140 948 124 1000 120V168Z" fill={GREEN} />
    </svg>
  )
  return <>
    <svg className="brand-curve is-top" viewBox="0 0 340 180" aria-hidden="true">
      <path d="M0 84L125 92C85 118 40 148 0 180Z" fill={GREEN} />
      <path d="M0 0H335C290 52 200 88 85 98H0Z" fill={ORANGE} />
      <path d="M0 0H225C205 70 140 104 60 104C35 104 15 101 0 96Z" fill={BLUE} />
    </svg>
    <svg className="brand-curve is-bottom" viewBox="770 370 230 116" aria-hidden="true">
      <path d="M776 486C815 452 880 432 965 428H1000V486Z" fill={ORANGE} />
      <path d="M900 445C930 408 962 386 1000 372V445Z" fill={GREEN} />
      <path d="M851 486C885 452 935 432 1000 426V486Z" fill={BLUE} />
    </svg>
  </>
}

/**
 * PC 홈 큰 이미지 자리 슬라이드(2026-11-09 사용자 요청, 2026-11-10 시안 모양). 6초마다 다음 장, 마우스를 올리거나 안에 포커스가 있으면 멈춤.
 * 왼쪽 아래 이전·멈춤/재생·다음 + 그 아래 점, 키보드 ←/→. 움직임 줄이기 설정이면 처음부터 멈춤. 보이지 않는 장은 inert(탭 이동 제외).
 * 장 안의 글은 왼쪽 아래 조작 버튼 자리(아래 64px)를 비워 둔다. 로고 색 곡선은 장마다 그려 장과 함께 넘어간다.
 */
export default function HeroSlider({ slides, className = '' }: { slides: HeroSlide[]; className?: string }) {
  const items = slides.slice(0, MAX_SLIDES)
  const count = items.length
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [stopped, setStopped] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const current = count ? index % count : 0

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count])

  useEffect(() => {
    if (count < 2 || hovered || stopped) return
    const timer = window.setInterval(() => { if (!document.hidden) setIndex(value => (value + 1) % count) }, INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [count, hovered, stopped])

  if (!count) return null

  return (
    <section className={`hero-slider ${className}`} aria-roledescription="carousel" aria-label="홈 배너"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false) }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1) }
        if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1) }
      }}>
      <div className="hero-slider__track" style={{ transform: `translateX(-${current * 100}%)` }}>
        {items.map((slide, i) => (
          <div key={slide.key} className="hero-slider__slide" role="group" aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}: ${slide.label}`} aria-hidden={i !== current} inert={i !== current}>
            {slide.content}
            {slide.curves === false ? null : <BrandCurves />}
          </div>
        ))}
      </div>
      {count > 1 ? <div className="hero-slider__controls">
        <div className="hero-slider__buttons">
          <button type="button" className="hero-slider__ctrl" aria-label="이전 배너" onClick={() => go(current - 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className="hero-slider__ctrl" aria-label={stopped ? '배너 자동 넘김 켜기' : '배너 자동 넘김 멈추기'} aria-pressed={stopped}
            onClick={() => setStopped(value => !value)}>
            {stopped
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>}
          </button>
          <button type="button" className="hero-slider__ctrl" aria-label="다음 배너" onClick={() => go(current + 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="hero-slider__dots">
          {items.map((slide, i) => (
            <button key={slide.key} type="button" className={`hero-slider__dot${i === current ? ' is-active' : ''}`}
              aria-label={`${i + 1}번째 배너: ${slide.label}`} aria-current={i === current ? 'true' : undefined} onClick={() => go(i)} />
          ))}
        </div>
      </div> : null}
    </section>
  )
}
