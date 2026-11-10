import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'

/** 서버 /v2/workspace/instagram — 더채움 인스타그램 최근 게시물(서버가 thefull.co.kr/instagram-proxy를 대신 조회) */
export type InstagramPost = {
  id: string | null; media_type: string; image: string; permalink: string; timestamp: string | null
  /** 글 첫 줄(최대 120자) */
  caption: string
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; posts: InstagramPost[] }

export function useInstagram(limit = 4): State {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(buildApiUrl(`/v2/workspace/instagram?${new URLSearchParams({ limit: String(limit) })}`), { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<{ status: string; posts: InstagramPost[] }> : null)
      .then(data => {
        if (controller.signal.aborted) return
        setState(data?.status === 'OK' ? { status: 'ok', posts: data.posts ?? [] } : { status: 'error' })
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) })
    return () => controller.abort()
  }, [limit])
  return state
}
