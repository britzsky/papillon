import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { requestAiSanitationNote } from '../../api/ai'
import { getAccountOptions } from '../../api/operations'
import {
  getHygieneCategories, getHygieneRecords, hygienePhotoUrl, saveHygieneCategories, saveHygieneRecord, uploadHygienePhoto,
  type HygieneCategory, type HygieneRecord,
} from '../../api/hygiene'
import { isHeadquarters, workspaceAccountId } from '../workspace/workspaceAccount'

export type HygieneStatus = 'CHECK' | 'DONE'
/** 상태 거르기: 기록 상태 + 미점검(그 기간에 기록이 없는 카테고리) */
export type HygieneFilter = HygieneStatus | 'MISSING' | ''
export type HygieneSide = 'problem' | 'clean'
export const STATUS_LABEL: Record<HygieneStatus, string> = { CHECK: '조치 필요', DONE: '조치 완료' }
export const SIDE_LABEL: Record<HygieneSide, string> = { problem: '부적합', clean: '조치' }

/**
 * 조치 완료 판정 — ERP 위생관리 화면(thefull.kr #/Operate/OperateTabs, 2026-10-29 화면 코드 확인)과 같게:
 * 카테고리가 있는 기록은 조치 사진과 조치 내용이 모두 있어야, 카테고리 없는 예전 기록은 조치 내용만 있으면 완료.
 */
export const hygieneStatus = (record: HygieneRecord): HygieneStatus => {
  const note = Boolean(record.clean_note.trim())
  return (record.category_key ? Boolean(record.clean_image) && note : note) ? 'DONE' : 'CHECK'
}
/** '구분 없음'(카테고리 없는 예전 기록) 카드의 상세 보기 값 — 카테고리 키가 빈 값이라 따로 둔다 */
export const UNKEYED = '__unkeyed'
/** 전(부적합)·후(조치) 기록 여부 — ERP와 같게 카테고리가 있으면 사진 기준, 없으면 사진 또는 내용 */
export const hygieneHas = (record: HygieneRecord, side: HygieneSide) => {
  const image = side === 'problem' ? record.problem_image : record.clean_image
  const note = side === 'problem' ? record.problem_note : record.clean_note
  return record.category_key ? Boolean(image) : Boolean(image || note.trim())
}

const thisMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)
const emptyRecord = (categoryKey: string): HygieneRecord => ({ category_key: categoryKey, problem_image: '', problem_note: '', clean_image: '', clean_note: '', note: '' })

/**
 * 위생 점검 관리(PC·터치 공용, 2026-10-26). 데이터는 서버 /v2/hygiene → 기존 ERP 위생관리(앱 위생점검과 같은 기록).
 * 거래처는 '관리 거래처'(본사 선택, 현장 고정). 기간은 등록 월(비우면 누적 전체).
 * 기록 저장은 본사·현장 모두, 기록 삭제·카테고리 설정은 본사만(서버도 막음).
 */
export function useHygieneBoard() {
  const [searchParams] = useSearchParams()
  const accountId = workspaceAccountId(searchParams)
  const headquarters = isHeadquarters()
  const [accountName, setAccountName] = useState(() => (headquarters ? '' : localStorage.getItem('account_name') || ''))
  const [categories, setCategories] = useState<HygieneCategory[]>([])
  const [records, setRecords] = useState<HygieneRecord[]>([])
  const [imageBase, setImageBase] = useState('')
  // 주소 ?month=(빈 값=누적 전체)&status=CHECK — 본사 홈 '위생 조치 필요'에서 지난달 미조치 기록까지 바로 보이게(2026-10-29)
  const [month, setMonth] = useState(() => searchParams.has('month') ? searchParams.get('month') || '' : thisMonth())
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<HygieneFilter>(() => (searchParams.get('status') === 'CHECK' ? 'CHECK' : ''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 편집 중인 기록(새 기록은 idx 없음) */
  const [draft, setDraft] = useState<HygieneRecord | null>(null)
  const [busy, setBusy] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!headquarters || !accountId) return
    let alive = true
    void getAccountOptions().then(rows => { if (alive) setAccountName(rows.find(row => row.value === accountId)?.text || accountId) }).catch(() => {})
    return () => { alive = false }
  }, [headquarters, accountId])

  useEffect(() => {
    if (!accountId) { setRecords([]); setCategories([]); return }
    let alive = true
    setLoading(true); setError('')
    Promise.all([getHygieneCategories(accountId), getHygieneRecords(accountId, month)])
      .then(([nextCategories, result]) => {
        if (!alive) return
        setCategories(nextCategories)
        setRecords(result.records)
        setImageBase(result.imageBase)
      })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : '위생 점검 기록을 불러오지 못했습니다.'); setRecords([]) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [accountId, month, revision])

  const reload = useCallback(() => setRevision(value => value + 1), [])
  const photoUrl = useCallback((path: string) => hygienePhotoUrl(imageBase, path), [imageBase])
  const categoryName = useCallback((key: string) => categories.find(row => row.category_key === key)?.category_name || '', [categories])

  const counts = useMemo(() => records.reduce((acc, record) => { acc[hygieneStatus(record)] += 1; return acc }, { CHECK: 0, DONE: 0 } as Record<HygieneStatus, number>), [records])
  // 상단 '전체 점검 현황'(2026-10-29 사용자 시안): 기간 기록 중 조치 완료 비율
  const doneRate = records.length ? Math.round(counts.DONE / records.length * 100) : 0
  const visibleRecords = useMemo(() => records.filter(record => {
    // 상세 보기(카테고리 하나)의 기록 목록. 미점검 알약은 카드에만 쓰이므로 기록은 모두 보인다
    if ((statusFilter === 'CHECK' || statusFilter === 'DONE') && hygieneStatus(record) !== statusFilter) return false
    return !categoryFilter || (categoryFilter === UNKEYED ? !record.category_key : record.category_key === categoryFilter)
  }), [records, statusFilter, categoryFilter])

  const startNew = (categoryKey?: string) => { setNotice(''); setDraft(emptyRecord(categoryKey ?? (categoryFilter === UNKEYED ? '' : categoryFilter))) }
  const startEdit = (record: HygieneRecord) => { setNotice(''); setDraft({ ...record }) }
  const updateDraft = (patch: Partial<HygieneRecord>) => setDraft(current => (current ? { ...current, ...patch } : current))

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label); setError('')
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.') } finally { setBusy('') }
  }

  /** 사진 한 장(칸마다 1장)을 올려 편집 중 기록에 넣는다. 저장해야 기록에 남는다 */
  const uploadPhoto = (side: HygieneSide, file: File | undefined) => {
    if (!file || !accountId) return
    if (!file.type.startsWith('image/')) { setError('사진 파일만 올릴 수 있습니다.'); return }
    void run(`photo:${side}`, async () => {
      const path = await uploadHygienePhoto(accountId, file)
      updateDraft(side === 'problem' ? { problem_image: path } : { clean_image: path })
    })
  }

  const saveDraft = () => {
    if (!draft || !accountId) return
    if (!draft.idx && !draft.problem_note.trim() && !draft.problem_image) { setError('부적합 내용이나 사진을 넣어주세요.'); return }
    void run('save', async () => {
      await saveHygieneRecord(accountId, draft)
      setNotice(draft.idx ? '점검 기록을 수정했습니다.' : '부적합 사항을 등록했습니다.')
      setDraft(null)
      // 새 기록이 다른 달로 들어가지 않게: 등록은 이번 달이라 이번 달(또는 전체)로 다시 읽는다
      if (!draft.idx && month && month !== thisMonth()) setMonth(thisMonth())
      else reload()
    })
  }

  const remove = (record: HygieneRecord) => {
    if (!record.idx || !accountId) return
    if (!window.confirm(`이 점검 기록을 삭제할까요?\n${record.problem_note || '(내용 없음)'}`)) return
    void run('delete', async () => {
      await saveHygieneRecord(accountId, { ...record, del_yn: 'Y' })
      setNotice('점검 기록을 삭제했습니다.')
      if (draft?.idx === record.idx) setDraft(null)
      reload()
    })
  }

  const saveCategories = async (next: HygieneCategory[]) => {
    if (!accountId) return false
    let ok = false
    await run('categories', async () => {
      setCategories(await saveHygieneCategories(accountId, next))
      if (categoryFilter && categoryFilter !== UNKEYED && !next.some(row => row.category_key === categoryFilter)) setCategoryFilter('')
      setNotice('카테고리를 저장했습니다.')
      ok = true
    })
    return ok
  }

  /** 편집 중 기록의 부적합·조치 문구를 AI로 다듬는다(저장은 사람이) */
  const polishWithAi = () => {
    if (!draft) return
    void run('ai', async () => {
      const result = await requestAiSanitationNote({
        vendor_name: accountName, inspection_date: draft.reg_dt || new Date().toISOString().slice(0, 10), inspection_mode: draft.clean_image || draft.clean_note ? '조치후' : '조치전',
        sections: [{ key: 'record', title: categoryName(draft.category_key) || '위생 점검', before_note: draft.problem_note, after_note: draft.clean_note }],
      })
      const section = result.sections.find(row => row.key === 'record') ?? result.sections[0]
      if (section) updateDraft({ problem_note: section.before_note || draft.problem_note, clean_note: section.after_note || draft.clean_note })
      setNotice(result.summary || 'AI 문구를 넣었습니다. 확인 후 저장해주세요.')
    })
  }

  return {
    accountId, accountName, headquarters, categories, records, visibleRecords, counts, doneRate, month, setMonth,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, loading, error, setError, notice, setNotice,
    draft, setDraft, startNew, startEdit, updateDraft, uploadPhoto, saveDraft, remove, saveCategories, polishWithAi, busy,
    photoUrl, categoryName, reload,
  }
}

export type HygieneBoardState = ReturnType<typeof useHygieneBoard>
