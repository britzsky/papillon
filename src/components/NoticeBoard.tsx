import { useId, useState } from 'react'
import { useNotices } from '../features/home/useNotices'
import { useReportReady } from '../features/home/homeReady'
import type { PressArticle } from './PressSlide'

/** 등록 후 이 날수 안이면 'N'(새 글) 표시 */
const NEW_DAYS = 7
/** 분류 알약 색(시안: 초록·주황·파랑) — 목록에 처음 나온 분류 순서대로 돌려 쓴다 */
const PILL_COLORS = ['is-green', 'is-orange', 'is-blue']

/** 'YYYY-MM-DD…' → 'YY.MM.DD' */
const shortDate = (value: string | null) => value && value.length >= 10 ? `${value.slice(2, 4)}.${value.slice(5, 7)}.${value.slice(8, 10)}` : ''
const isNew = (value: string | null) => {
  if (!value) return false
  const time = new Date(value.replace(' ', 'T')).getTime()
  return Number.isFinite(time) && Date.now() - time < NEW_DAYS * 86400000
}

type Tab = 'notice' | 'press'
const TABS: { key: Tab; label: string }[] = [{ key: 'notice', label: '공지사항' }, { key: 'press', label: '홍보' }]

/**
 * PC 홈 '더채움 소식'(2026-11-10 시안: 흰 카드 · 탭 · 줄 = 분류 알약 · 날짜 | 제목).
 * 공지사항 = 본사 ERP HeadOffice/NoticeList(2026-11-09 사용자 요청), 홍보 = 언론 보도 기사(슬라이드와 같은 목록, 누르면 원문 새 창).
 * 다섯 줄 높이를 넘으면 목록 안에서 스크롤. 공지 상세 화면은 아직 없음(소분류·작성자는 제목에 마우스를 올리면 보임).
 */
export default function NoticeBoard({ press = [] }: { press?: PressArticle[] }) {
  const state = useNotices()
  useReportReady('notices', state.status !== 'loading')
  const [tab, setTab] = useState<Tab>('notice')
  const baseId = useId()
  const notices = state.status === 'ok' ? state.notices : []
  const categories = [...new Set(notices.map(notice => notice.large_type_nm || '공지'))]
  const pillColor = (name: string) => PILL_COLORS[Math.max(0, categories.indexOf(name)) % PILL_COLORS.length]

  return (
    <section className="home-news" aria-labelledby={`${baseId}-title`}>
      <div className="home-news__head">
        <h2 id={`${baseId}-title`} className="home-news__title">더채움 소식</h2>
        <div className="home-news__tabs" role="tablist" aria-label="소식 종류">
          {TABS.map(item => (
            <button key={item.key} type="button" role="tab" id={`${baseId}-${item.key}`} aria-controls={`${baseId}-panel`}
              aria-selected={tab === item.key} tabIndex={tab === item.key ? 0 : -1}
              className={`home-news__tab${tab === item.key ? ' is-active' : ''}`} onClick={() => setTab(item.key)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const step = event.key === 'ArrowRight' ? 1 : TABS.length - 1
                const next = TABS[(TABS.findIndex(t => t.key === tab) + step) % TABS.length].key
                setTab(next); document.getElementById(`${baseId}-${next}`)?.focus()
              }}>{item.label}</button>
          ))}
        </div>
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`}>
        {tab === 'press'
          ? !press.length ? <p className="rd-muted home-news__msg">등록된 홍보 기사가 없어요.</p>
            : <ul className="home-news__list">
              {press.map(article => (
                <li key={article.url}>
                  <span className="home-news__pill is-orange">언론</span>
                  <time className="home-news__date" dateTime={article.date}>{shortDate(article.date)}</time>
                  <a className="home-news__text" href={article.url} target="_blank" rel="noopener noreferrer" title={`${article.title} — ${article.outlet}`}>
                    {article.title}<span className="rd-sr-only"> — {article.outlet} (새 창)</span>
                  </a>
                </li>
              ))}
            </ul>
          : state.status === 'loading' ? <p className="rd-muted home-news__msg" role="status">공지사항을 불러오고 있어요.</p>
          : state.status === 'error' ? <p className="rd-text-warn home-news__msg" role="alert">공지사항을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>
          : !notices.length ? <p className="rd-muted home-news__msg">등록된 공지사항이 없어요.</p>
          : <ul className="home-news__list">
            {notices.map(notice => {
              const category = notice.large_type_nm || '공지'
              return (
                <li key={notice.idx}>
                  <span className={`home-news__pill ${pillColor(category)}`}>{category}</span>
                  <time className="home-news__date" dateTime={notice.reg_dt?.slice(0, 10)}>{shortDate(notice.reg_dt)}</time>
                  <span className="home-news__text" title={[notice.title, notice.middle_type_nm, notice.user_name].filter(Boolean).join(' · ')}>
                    {isNew(notice.reg_dt) ? <b className="home-news__new" aria-label="새 글">N</b> : null}
                    {notice.title}
                    {notice.file_cnt ? <span className="home-news__file" aria-label={`첨부 ${notice.file_cnt}개`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5" /></svg>
                      {notice.file_cnt}</span> : null}
                  </span>
                </li>
              )
            })}
          </ul>}
      </div>
    </section>
  )
}
