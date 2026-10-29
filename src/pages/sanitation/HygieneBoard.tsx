import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { HygieneCategory, HygieneRecord } from '../../api/hygiene'
import { hygieneHas, hygieneStatus, SIDE_LABEL, UNKEYED, STATUS_LABEL, type HygieneBoardState, type HygieneFilter, type HygieneSide } from '../../features/sanitation/useHygieneBoard'
import './HygieneBoard.css'

const NOTE_FIELD = { problem: 'problem_note', clean: 'clean_note' } as const
const IMAGE_FIELD = { problem: 'problem_image', clean: 'clean_image' } as const
const STATUS_FILTERS: [HygieneFilter, string][] = [['', '전체'], ['CHECK', STATUS_LABEL.CHECK], ['DONE', '완료'], ['MISSING', '미점검']]
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const NOTE_PLACEHOLDER: Record<HygieneSide, string> = { problem: '부적합 내용 (예: 후드 내부 청소 미흡)', clean: '조치한 내용 (예: 후드 필터 세척 완료)' }

/**
 * 위생 점검 관리 본문(PC VendorSanitation·터치 SanitationTouch 공용). 점검 현황·기간·상태 → 카테고리 카드(전·후·상태·기록 요약) →
 * '상세 보기'로 그 카테고리 기록 카드(부적합 | 조치) → 등록·수정 창(사진 칸마다 1장, ERP 구조) · 사진 크게 보기 · 카테고리 편집(본사).
 */
export default function HygieneBoard({ board }: { board: HygieneBoardState }) {
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const b = board
  // 연·월 선택: month 'YYYY-MM'(빈 값 = 전체 기간). 연도는 올해부터 5년 전까지
  const [year, monthNo] = b.month ? b.month.split('-') : ['', '']
  const [now] = useState(() => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7))
  const thisMonthNo = now.slice(5, 7)
  const years = Array.from({ length: 6 }, (_, i) => String(Number(now.slice(0, 4)) - i))
  // 카테고리 카드: 전 = 부적합 기록, 후 = 조치 기록, 상태 = 미점검(기록 없음) · 조치 필요(조치 안 된 기록) · 완료. 상태 알약으로 카드를 거른다
  // 카드 목록은 ERP 화면과 같게: 사용 안 함(use_yn N) 카테고리는 기록이 있을 때만, 목록에 없는 키의 기록은 그 키로,
  // 카테고리 없는 예전 기록은 '구분 없음' 카드로(빼면 기존 기록 대부분이 안 보인다)
  const keyed = new Set(b.records.map(record => record.category_key || ''))
  const activeCategories: HygieneCategory[] = [
    ...b.categories.filter(row => row.use_yn !== 'N' || keyed.has(row.category_key)),
    ...[...keyed].filter(key => !b.categories.some(row => row.category_key === key))
      .map(key => ({ category_key: key, category_name: key || '구분 없음', description: '', manage_point: '' })),
  ]
  const cards = activeCategories.map(row => {
    const records = b.records.filter(record => (record.category_key || '') === row.category_key)
    const open = records.filter(record => hygieneStatus(record) === 'CHECK').length
    const state: 'missing' | 'check' | 'done' = !records.length ? 'missing' : open ? 'check' : 'done'
    return { row, records, open, state, before: records.filter(record => hygieneHas(record, 'problem')).length,
      after: records.filter(record => hygieneHas(record, 'clean')).length }
  }).filter(card => !b.statusFilter || card.state === ({ CHECK: 'check', DONE: 'done', MISSING: 'missing' } as const)[b.statusFilter])
  const detail = activeCategories.find(row => (row.category_key || UNKEYED) === b.categoryFilter)

  if (!b.accountId) return <p className="hg-empty">위 '관리 거래처'에서 거래처를 고르면 위생 점검 기록이 나옵니다.</p>

  return <div className="hg">
    <section className="hg-filters" aria-label="조회 조건">
      {/* 위: 전체 점검 현황(완료율·완료·조치 필요) | 연·월 (2026-10-29 사용자 시안) */}
      <div className="hg-filters__row hg-filters__top">
        <div className="hg-summary" aria-label="전체 점검 현황">
          <span className="hg-summary__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 12l2.5 2.5L16 9" /></svg></span>
          <strong className="hg-summary__title">전체 점검 현황</strong>
          <strong className="hg-summary__rate">{b.doneRate}%</strong>
          <span className="hg-summary__chip is-done"><i aria-hidden="true" />완료 <b>{b.counts.DONE}건</b></span>
          <span className="hg-summary__chip is-check"><i aria-hidden="true" />조치 필요 <b>{b.counts.CHECK}건</b></span>
        </div>
        <span className="hg-period">
          <select aria-label="연도" value={year} onChange={event => b.setMonth(event.target.value ? `${event.target.value}-${monthNo || thisMonthNo}` : '')}>
            <option value="">전체 기간</option>
            {years.map(value => <option key={value} value={value}>{value}년</option>)}
          </select>
          {year ? <select aria-label="월" value={monthNo} onChange={event => b.setMonth(`${year}-${event.target.value}`)}>
            {MONTHS.map(value => <option key={value} value={value}>{Number(value)}월</option>)}
          </select> : null}
        </span>
      </div>
      <div className="hg-filters__row">
        <div className="hg-pills hg-pills--status" role="group" aria-label="상태">
          {STATUS_FILTERS.map(([value, label]) => <button key={value || 'all'} type="button" className={`hg-pill${b.statusFilter === value ? ' is-active' : ''}`} aria-pressed={b.statusFilter === value}
            onClick={() => b.setStatusFilter(value)}>{label}</button>)}
        </div>
        <span className="hg-filters__actions">
          <span className="hg-filters__count">점검 항목 <b>{activeCategories.length}개</b></span>
          {b.headquarters ? <button type="button" className="hg-btn t-btn is-outline" onClick={() => setCategoryOpen(true)}>카테고리 편집</button> : null}
        </span>
      </div>
    </section>

    {b.notice ? <p className="hg-msg is-ok" role="status">{b.notice}</p> : null}
    {b.error && !b.draft ? <p className="hg-msg is-error" role="alert">{b.error}</p> : null}
    {b.loading ? <p className="hg-msg" role="status">위생 점검 기록을 불러오는 중…</p> : null}

    {/* 카테고리 카드(2026-10-29 사용자 시안): 전·후 건수, 상태, 기록 요약. '상세 보기'를 누르면 그 카테고리 기록 카드(부적합 | 조치) */}
    {!b.loading && !detail ? <section className="hg-grid" aria-label="점검 항목">
      {cards.map(card => <article key={card.row.category_key} className={`hg-cat is-${card.state}`}>
        <header className="hg-cat__head">
          <strong title={[card.row.description, card.row.manage_point].filter(Boolean).join(' · ') || undefined}>{card.row.category_name}</strong>
          <button type="button" className="hg-more" onClick={() => b.setCategoryFilter(card.row.category_key || UNKEYED)}>상세 보기<span aria-hidden="true">›</span></button>
        </header>
        <div className="hg-cat__meta">
          <span className="hg-count">전 <b>{card.before}</b></span>
          <span className="hg-count is-after">후 <b>{card.after}</b></span>
          <span className={`hg-status is-${card.state}`}>{card.state === 'missing' ? '미점검' : card.state === 'check' ? `조치 필요 ${card.open}건` : '완료'}</span>
        </div>
        {card.records.length ? <>
          <ul className="hg-cat__list">
            {card.records.slice(0, 4).map(record => {
              const status = hygieneStatus(record)
              return <li key={record.idx ?? record.reg_dt}>
                <button type="button" className={`hg-cat__item is-${status.toLowerCase()}`} onClick={() => b.startEdit(record)} title={`${record.problem_note || '사진만 등록'} — 눌러서 ${status === 'CHECK' ? '조치 입력' : '수정'}`}>
                  <span className="hg-cat__text"><span>{record.problem_note || record.clean_note || '사진만 등록'}</span>{record.reg_dt ? <small>{record.reg_dt.slice(5).replace('-', '/')}</small> : null}</span>
                  <em>{status === 'CHECK' ? '조치 대기' : '조치 완료'}</em>
                </button>
              </li>
            })}
          </ul>
          {card.records.length > 4 ? <button type="button" className="hg-cat__rest" onClick={() => b.setCategoryFilter(card.row.category_key || UNKEYED)}>외 {card.records.length - 4}건 더 보기</button> : null}
          <button type="button" className="hg-cat__add" onClick={() => b.startNew(card.row.category_key)}><span aria-hidden="true">＋</span> 항목 추가</button>
        </> : <button type="button" className="hg-cat__empty" onClick={() => b.startNew(card.row.category_key)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6" /></svg>
          <span>등록된 점검 항목이 없습니다</span><b>눌러서 항목 추가</b>
        </button>}
      </article>)}
      {!cards.length ? <p className="hg-empty">{b.categories.length ? '조건에 맞는 점검 항목이 없습니다.' : '등록된 위생 카테고리가 없습니다.'}</p> : null}
    </section> : null}

    {!b.loading && detail ? <section className="hg-list" aria-label={`${detail.category_name} 점검 기록`}>
      <div className="hg-detail__head">
        <button type="button" className="hg-btn t-btn is-ghost" onClick={() => b.setCategoryFilter('')}>‹ 전체 항목</button>
        <strong>{detail.category_name}</strong>
        {detail.description ? <small>{detail.description}</small> : null}
        <button type="button" className="hg-btn t-btn is-primary" onClick={() => b.startNew(detail.category_key)}>＋ 부적합 등록</button>
      </div>
      {b.visibleRecords.map(record => <RecordCard key={record.idx ?? record.reg_dt} record={record} board={b} onView={setViewer} />)}
      {!b.visibleRecords.length ? <p className="hg-empty">{`${b.month ? `${b.month.replace('-', '년 ')}월에` : '아직'} 조건에 맞는 기록이 없습니다.`}</p> : null}
    </section> : null}

    {b.draft ? <RecordEditor board={b} onView={setViewer} /> : null}
    {viewer ? createPortal(<div className="hg-viewer" role="presentation" onClick={() => setViewer(null)}>
      <figure role="dialog" aria-modal="true" aria-label={`${viewer.label} 사진 크게 보기`} onClick={event => event.stopPropagation()}>
        <img src={viewer.url} alt={viewer.label} />
        <figcaption>{viewer.label}<button type="button" className="hg-btn t-btn" onClick={() => setViewer(null)}>닫기</button></figcaption>
      </figure>
    </div>, document.body) : null}
    {categoryOpen ? <CategoryEditor board={b} onClose={() => setCategoryOpen(false)} /> : null}
  </div>
}

function Side({ side, record, board, onView }: { side: HygieneSide; record: HygieneRecord; board: HygieneBoardState; onView: (photo: { url: string; label: string }) => void }) {
  const image = record[IMAGE_FIELD[side]]
  const note = record[NOTE_FIELD[side]]
  const url = board.photoUrl(image)
  return <div className={`hg-side is-${side}`}>
    <span className={`hg-tag is-${side}`}>{SIDE_LABEL[side]}</span>
    {url ? <button type="button" className="hg-photo" onClick={() => onView({ url, label: `${SIDE_LABEL[side]} 사진` })} aria-label={`${SIDE_LABEL[side]} 사진 크게 보기`}><img src={url} alt="" loading="lazy" /></button>
      : <span className="hg-photo is-empty">사진 없음</span>}
    <p className={`hg-note${note ? '' : ' is-empty'}`}>{note || (side === 'clean' ? '아직 조치 내용이 없습니다.' : '내용 없음')}</p>
  </div>
}

function RecordCard({ record, board, onView }: { record: HygieneRecord; board: HygieneBoardState; onView: (photo: { url: string; label: string }) => void }) {
  const status = hygieneStatus(record)
  const category = board.categoryName(record.category_key)
  return <article className={`hg-card is-${status.toLowerCase()}`}>
    <header className="hg-card__head">
      <span className={`hg-status is-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>
      {category ? <span className="hg-chip">{category}</span> : null}
      <small>등록 {record.reg_dt || '-'}{record.reg_user_name ? ` · ${record.reg_user_name}` : ''}{record.mod_dt && record.mod_dt !== record.reg_dt ? ` · 수정 ${record.mod_dt}${record.mod_user_name ? ` ${record.mod_user_name}` : ''}` : ''}</small>
      <span className="hg-card__actions">
        <button type="button" className="hg-btn t-btn is-small" onClick={() => board.startEdit(record)}>{status === 'CHECK' ? '조치 입력' : '수정'}</button>
        {board.headquarters ? <button type="button" className="hg-btn t-btn is-small is-ghost" disabled={board.busy === 'delete'} onClick={() => board.remove(record)}>삭제</button> : null}
      </span>
    </header>
    <div className="hg-card__body">
      <Side side="problem" record={record} board={board} onView={onView} />
      <Side side="clean" record={record} board={board} onView={onView} />
    </div>
    {record.note ? <p className="hg-card__remark"><b>비고</b>{record.note}</p> : null}
  </article>
}

function RecordEditor({ board, onView }: { board: HygieneBoardState; onView: (photo: { url: string; label: string }) => void }) {
  const draft = board.draft!
  const busy = Boolean(board.busy)
  const knownCategory = board.categories.some(row => row.category_key === draft.category_key)
  const side = (key: HygieneSide) => {
    const image = draft[IMAGE_FIELD[key]]
    const url = board.photoUrl(image)
    const inputId = `hg-file-${key}`
    return <div className={`hg-edit-side is-${key}`}>
      <span className={`hg-tag is-${key}`}>{SIDE_LABEL[key]}</span>
      <div className="hg-edit-photo">
        {url ? <button type="button" className="hg-photo" onClick={() => onView({ url, label: `${SIDE_LABEL[key]} 사진` })}><img src={url} alt={`${SIDE_LABEL[key]} 사진`} /></button>
          : <span className="hg-photo is-empty">{board.busy === `photo:${key}` ? '올리는 중…' : '사진 없음'}</span>}
        <span className="hg-edit-photo__actions">
          <label htmlFor={inputId} className={`hg-btn t-btn is-small${busy ? ' is-disabled' : ''}`}>{url ? '사진 바꾸기' : '사진 올리기'}
            <input id={inputId} type="file" accept="image/*" capture="environment" disabled={busy} onChange={event => { board.uploadPhoto(key, event.target.files?.[0]); event.target.value = '' }} />
          </label>
          {url ? <button type="button" className="hg-btn t-btn is-small is-ghost" disabled={busy} onClick={() => board.updateDraft(key === 'problem' ? { problem_image: '' } : { clean_image: '' })}>사진 빼기</button> : null}
        </span>
      </div>
      <label className="hg-field is-block"><span>{SIDE_LABEL[key]} 내용</span>
        <textarea rows={3} value={draft[NOTE_FIELD[key]]} placeholder={NOTE_PLACEHOLDER[key]}
          onChange={event => board.updateDraft(key === 'problem' ? { problem_note: event.target.value } : { clean_note: event.target.value })} />
      </label>
    </div>
  }
  return createPortal(<div className="hg-modal" role="presentation" onClick={() => { if (!busy) board.setDraft(null) }}>
    <section className="hg-dialog" role="dialog" aria-modal="true" aria-labelledby="hg-edit-title" onClick={event => event.stopPropagation()}>
      <header className="hg-dialog__head">
        <div><h2 id="hg-edit-title">{draft.idx ? '점검 기록 수정' : '부적합 등록'}</h2><p>{board.accountName}{draft.reg_dt ? ` · 등록 ${draft.reg_dt}` : ''}</p></div>
        <button type="button" className="hg-close t-btn is-ghost is-icon" aria-label="닫기" disabled={busy} onClick={() => board.setDraft(null)}>×</button>
      </header>
      <div className="hg-dialog__body">
        <label className="hg-field"><span>카테고리</span>
          <select value={knownCategory ? draft.category_key : ''} onChange={event => board.updateDraft({ category_key: event.target.value })}>
            <option value="">분류 없음</option>
            {board.categories.map(row => <option key={row.category_key} value={row.category_key}>{row.category_name}</option>)}
          </select>
        </label>
        <div className="hg-edit-sides">{side('problem')}{side('clean')}</div>
        <label className="hg-field is-block"><span>비고 (요청 사항·기한)</span>
          <input value={draft.note} maxLength={500} placeholder="예: 11/5까지 조치 사진 첨부 부탁드립니다." onChange={event => board.updateDraft({ note: event.target.value })} />
        </label>
        {board.error ? <p className="hg-msg is-error" role="alert">{board.error}</p> : null}
      </div>
      <footer className="hg-dialog__actions">
        <button type="button" className="hg-btn t-btn is-soft hg-ai" disabled={busy || (!draft.problem_note.trim() && !draft.clean_note.trim())} onClick={board.polishWithAi}>{board.busy === 'ai' ? 'AI 문구 만드는 중…' : 'AI로 문구 다듬기'}</button>
        <button type="button" className="hg-btn t-btn" disabled={busy} onClick={() => board.setDraft(null)}>취소</button>
        <button type="button" className="hg-btn t-btn is-primary" disabled={busy} onClick={board.saveDraft}>{board.busy === 'save' ? '저장 중…' : '저장'}</button>
      </footer>
    </section>
  </div>, document.body)
}

/** 거래처 위생 카테고리(본사). 저장하면 목록 전체가 ERP에 반영되고, 목록에서 뺀 카테고리의 기록은 '분류 없음'으로 보인다 */
function CategoryEditor({ board, onClose }: { board: HygieneBoardState; onClose: () => void }) {
  const [draft, setDraft] = useState<HygieneCategory[]>(() => board.categories.map(row => ({ ...row })))
  const [error, setError] = useState('')
  const used = (key: string) => board.records.filter(record => record.category_key === key).length
  const update = (index: number, patch: Partial<HygieneCategory>) => { setDraft(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row))); setError('') }
  const move = (index: number, step: number) => setDraft(rows => {
    const next = [...rows]; const target = index + step
    if (target < 0 || target >= next.length) return rows
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const remove = (index: number) => {
    const row = draft[index]
    const count = row.category_key ? used(row.category_key) : 0
    if (count && !window.confirm(`'${row.category_name}' 카테고리에 이 기간 기록 ${count}건이 있습니다. 카테고리를 빼면 그 기록은 '분류 없음'으로 보입니다. 뺄까요?`)) return
    setDraft(rows => rows.filter((_, i) => i !== index))
  }
  const save = async () => {
    const rows = draft.map(row => ({ ...row, category_name: row.category_name.trim(), description: row.description.trim(), manage_point: row.manage_point.trim() }))
    if (!rows.length) { setError('카테고리를 1개 이상 남겨주세요.'); return }
    if (rows.some(row => !row.category_name)) { setError('카테고리 이름을 입력해주세요.'); return }
    if (new Set(rows.map(row => row.category_name)).size !== rows.length) { setError('같은 이름의 카테고리가 있습니다.'); return }
    if (await board.saveCategories(rows)) onClose()
  }
  return createPortal(<div className="hg-modal" role="presentation" onClick={onClose}>
    <section className="hg-dialog is-wide" role="dialog" aria-modal="true" aria-labelledby="hg-cat-title" onClick={event => event.stopPropagation()}>
      <header className="hg-dialog__head">
        <div><h2 id="hg-cat-title">위생 점검 카테고리</h2><p>{board.accountName}에만 적용 · 기존 앱 위생점검과 같은 목록입니다</p></div>
        <button type="button" className="hg-close t-btn is-ghost is-icon" aria-label="닫기" onClick={onClose}>×</button>
      </header>
      <div className="hg-dialog__body">
        <ol className="hg-cat-list">
          {draft.map((row, index) => <li key={row.category_key || `new-${index}`}>
            <span className="hg-cat-list__no">{index + 1}</span>
            <input aria-label={`${index + 1}번 카테고리 이름`} placeholder="이름 (예: 냉장·냉동고)" value={row.category_name} onChange={event => update(index, { category_name: event.target.value })} />
            <input aria-label={`${index + 1}번 설명`} placeholder="점검 기준 설명" value={row.description} onChange={event => update(index, { description: event.target.value })} />
            <input aria-label={`${index + 1}번 관리 포인트`} placeholder="관리 포인트" value={row.manage_point} onChange={event => update(index, { manage_point: event.target.value })} />
            <span className="hg-cat-list__actions">
              <button type="button" className="hg-btn t-btn is-small" aria-label="위로" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" className="hg-btn t-btn is-small" aria-label="아래로" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>↓</button>
              <button type="button" className="hg-btn t-btn is-small is-ghost" onClick={() => remove(index)}>빼기</button>
            </span>
          </li>)}
          {!draft.length ? <li className="hg-empty">카테고리가 없습니다. 아래에서 추가해주세요.</li> : null}
        </ol>
        <button type="button" className="hg-btn t-btn is-soft is-small" onClick={() => setDraft(rows => [...rows, { category_key: '', category_name: '', description: '', manage_point: '' }])}>＋ 카테고리 추가</button>
        {error || board.error ? <p className="hg-msg is-error" role="alert">{error || board.error}</p> : null}
      </div>
      <footer className="hg-dialog__actions">
        <button type="button" className="hg-btn t-btn" onClick={onClose}>취소</button>
        <button type="button" className="hg-btn t-btn is-primary" disabled={board.busy === 'categories'} onClick={() => void save()}>{board.busy === 'categories' ? '저장 중…' : '저장'}</button>
      </footer>
    </section>
  </div>, document.body)
}
