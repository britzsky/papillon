import { useState } from 'react'
import { useInstagram, type InstagramPost } from '../features/home/useInstagram'
import { INSTAGRAM_URL } from './QuickLinks'

const COUNT = 4

function Tile({ post }: { post: InstagramPost }) {
  const [failed, setFailed] = useState(false)
  const label = post.caption || '더채움 인스타그램 게시물'
  return (
    <a className="home-insta__tile" href={post.permalink} target="_blank" rel="noopener noreferrer" title={label}
      aria-label={`인스타그램: ${label} (새 창)`}>
      {failed ? null : <img src={post.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
      {post.media_type === 'VIDEO' || post.media_type === 'CAROUSEL_ALBUM'
        ? <span className="home-insta__kind" aria-hidden="true">{post.media_type === 'VIDEO' ? '▶' : '❐'}</span> : null}
    </a>
  )
}

/**
 * PC 홈 C 영역 — 더채움 인스타그램 최근 게시물 4개(2026-11-10 사용자 요청: thefull.co.kr/instagram-proxy?limit=4 내용).
 * 시안처럼 1·3번째는 짧게, 2·4번째는 길게 엇갈린 사진. 누르면 그 게시물을 새 창으로.
 * 불러오는 중·실패·게시물 부족이면 빈 칸은 회색, 실패하면 인스타그램 계정 링크를 보여 준다.
 */
export default function InstagramGrid() {
  const state = useInstagram(COUNT)
  const posts = state.status === 'ok' ? state.posts.slice(0, COUNT) : []
  return (
    <section className="home-insta" aria-label="더채움 인스타그램" aria-busy={state.status === 'loading'}>
      <div className="home-insta__grid">
        {Array.from({ length: COUNT }, (_, i) => posts[i]
          ? <Tile key={posts[i].permalink} post={posts[i]} />
          : <span key={`empty-${i}`} className="home-insta__tile is-empty" aria-hidden="true" />)}
      </div>
      {state.status === 'error' ? <p className="home-insta__msg">
        인스타그램 게시물을 불러오지 못했어요. <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">인스타그램에서 보기 ↗</a>
      </p> : null}
    </section>
  )
}
