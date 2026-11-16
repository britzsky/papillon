import { useEffect, useState } from 'react'
import { buildApiUrl } from '../../config/api'

/** 서버 /v2/workspace/notices — 기존 ERP 본사 공지사항(HeadOffice/NoticeList), 게시 기한 지난 것 제외·최신순 */
export type Notice = {
  idx: number; title: string
  large_type: number | null; large_type_nm: string | null; middle_type: number | null; middle_type_nm: string | null
  user_name: string | null; position_name: string | null; reg_dt: string | null; expire_dt: string | null; file_cnt: number | null
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; notices: Notice[] }

/** enabled=false(로그인 전)면 조회하지 않고 빈 목록 — 공지는 로그인한 사용자만(서버도 막음) */
export function useNotices(enabled = true): State {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(buildApiUrl('/v2/workspace/notices'), { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<{ status: string; notices: Notice[] }> : null)
      .then(data => {
        if (controller.signal.aborted) return
        setState(data?.status === 'OK' ? { status: 'ok', notices: data.notices ?? [] } : { status: 'error' })
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) })
    return () => controller.abort()
  }, [enabled])
  return enabled ? state : { status: 'ok', notices: [] }
}
