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
export type HygieneSide = 'problem' | 'clean'
export const STATUS_LABEL: Record<HygieneStatus, string> = { CHECK: '조치 필요', DONE: '조치 완료' }
export const SIDE_LABEL: Record<HygieneSide, string> = { problem: '부적합', clean: '조치' }
/** 카테고리 거르기에서 카테고리가 없는 기록 */
export const UNCATEGORIZED = '__none'

/** 조치 사진이나 조치 내용이 있으면 조치 완료 */
export const hygieneStatus = (record: HygieneRecord): HygieneStatus => (record.clean_image || record.clean_note.trim() ? 'DONE' : 'CHECK')

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
  const [month, setMonth] = useState(thisMonth)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<HygieneStatus | ''>('')
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
  const hasUncategorized = records.some(record => !record.category_key || !categories.some(row => row.category_key === record.category_key))
  const visibleRecords = useMemo(() => records.filter(record => {
    if (statusFilter && hygieneStatus(record) !== statusFilter) return false
    if (!categoryFilter) return true
    const known = categories.some(row => row.category_key === record.category_key)
    return categoryFilter === UNCATEGORIZED ? !known : record.category_key === categoryFilter
  }), [records, statusFilter, categoryFilter, categories])

  const startNew = () => { setNotice(''); setDraft(emptyRecord(categoryFilter && categoryFilter !== UNCATEGORIZED ? categoryFilter : '')) }
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
      if (categoryFilter && categoryFilter !== UNCATEGORIZED && !next.some(row => row.category_key === categoryFilter)) setCategoryFilter('')
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
    accountId, accountName, headquarters, categories, records, visibleRecords, counts, hasUncategorized, month, setMonth,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, loading, error, setError, notice, setNotice,
    draft, setDraft, startNew, startEdit, updateDraft, uploadPhoto, saveDraft, remove, saveCategories, polishWithAi, busy,
    photoUrl, categoryName, reload,
  }
}

export type HygieneBoardState = ReturnType<typeof useHygieneBoard>
