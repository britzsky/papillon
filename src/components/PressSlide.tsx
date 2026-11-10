import { useState } from 'react'

export type PressArticle = {
  url: string
  /** 기사 원문 제목(화면 읽기·목록용) */
  title: string
  outlet: string
  /** 'YYYY-MM-DD' */
  date: string
  /** 기사 대표 사진(언론사 CDN). 못 불러오면 초록 바탕 + 글만 보인다 */
  image?: string
  /** 슬라이드 큰 글씨(줄바꿈 \n). 없으면 기사 제목 */
  headline?: string
  /** 큰 글씨 아래 작은 글씨(줄바꿈 \n) */
  sub?: string
}

/**
 * 홈 슬라이드(HeroSlider) 한 장 = 더채움 언론 보도 기사(2026-11-10 시안: 사진을 꽉 채우고 왼쪽 아래에 흰 큰 글씨).
 * 누르면 기사 원문을 새 창으로. 사진은 언론사 CDN 그대로, referrer는 보내지 않는다.
 */
export default function PressSlide({ article }: { article: PressArticle }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = article.image && !imageFailed
  return (
    <a className={`press-slide${showImage ? '' : ' is-text-only'}`} href={article.url} target="_blank" rel="noopener noreferrer"
      aria-label={`언론 보도: ${article.title} — ${article.outlet} ${article.date} (새 창)`}>
      {showImage ? <img className="press-slide__photo" src={article.image} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : null}
      <span className="press-slide__copy">
        <strong className="press-slide__title">{article.headline || article.title}</strong>
        {article.sub ? <span className="press-slide__sub">{article.sub}</span> : null}
        <span className="press-slide__meta">{article.outlet} · {article.date.replaceAll('-', '.')}<span className="press-slide__go" aria-hidden="true">기사 보기 ↗</span></span>
      </span>
    </a>
  )
}
