import { workspaceAccountId } from '../workspace/workspaceAccount'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { requestAiSanitationNote } from '../../api/ai'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import { getToday } from './useVendorSanitation'

export type SanitationCategory = { id: string; name: string; description: string }
export type SanitationPhoto = { id: string; src: string; name: string }
export type SanitationSide = 'before' | 'after'
export type SanitationItem = {
  before: SanitationPhoto[]
  after: SanitationPhoto[]
  beforeNote: string
  afterNote: string
  beforeRemark: string
  afterRemark: string
}
export type SanitationStatus = 'NONE' | 'CHECK' | 'DONE'

export const MAX_PHOTOS = 5
export const STATUS_LABEL: Record<SanitationStatus, string> = { NONE: '미점검', CHECK: '확인 필요', DONE: '조치 완료' }
export const DEFAULT_CATEGORIES: SanitationCategory[] = [
  { id: 'kitchen', name: '주방 위생', description: '조리대 · 바닥 · 싱크대 주변 청결 상태' },
  { id: 'refrigerator', name: '냉장고 관리', description: '내부 정리 · 온도 기록 · 식재료 보관 상태' },
  { id: 'certificate', name: '보건증 부착', description: '게시 위치 및 유효기간 확인' },
  { id: 'vending', name: '자판기 청결', description: '외부 오염 · 투입구 · 하단 먼지 확인' },
  { id: 'license', name: '영업신고증', description: '부착 위치 및 기재 내용 확인' },
  { id: 'worker', name: '근무자 위생', description: '위생복 · 위생모 · 장갑 착용 상태' },
]

const EMPTY_ITEM: SanitationItem = { before: [], after: [], beforeNote: '', afterNote: '', beforeRemark: '', afterRemark: '' }

/** 사진이 없으면 미점검, 조치 후 사진과 조치 내용이 모두 있으면 조치 완료, 그 사이는 확인 필요 */
export function sanitationStatus(item: SanitationItem): SanitationStatus {
  if (!item.before.length && !item.after.length) return 'NONE'
  return item.after.length && item.afterNote.trim() ? 'DONE' : 'CHECK'
}

export const photoCountLabel = (item: SanitationItem) =>
  item.before.length || item.after.length ? `전 ${item.before.length}장 · 후 ${item.after.length}장` : '사진 없음'

/**
 * 위생 점검 관리(PC, 화면 시안): 거래처별 카테고리·점검일별 항목(조치 전/후 사진·전달 메모·조치 내용·비고).
 * 주의: 서버 저장 API가 아직 없어 카테고리·사진·메모는 이 화면 메모리에만 있다(새로고침 시 사라짐).
 * 터치 화면(SanitationTouch)은 아직 useVendorSanitation을 쓴다.
 */
export function useSanitationInspection() {
  const [searchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountId, setAccountId] = useState(() => workspaceAccountId(searchParams))
  const [inspectionDate, setInspectionDate] = useState(getToday())
  const [inspector, setInspector] = useState(() => localStorage.getItem('user_name') || '')
  const [statusFilter, setStatusFilter] = useState<SanitationStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categoriesByAccount, setCategoriesByAccount] = useState<Record<string, SanitationCategory[]>>({})
  const [items, setItems] = useState<Record<string, SanitationItem>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ kitchen: true })
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [activePhoto, setActivePhoto] = useState<Record<string, number>>({})
  const [lightbox, setLightbox] = useState<{ photos: SanitationPhoto[]; index: number } | null>(null)
  const [aiNoteMessage, setAiNoteMessage] = useState('')
  const [isAiNoteLoading, setIsAiNoteLoading] = useState(false)

  useEffect(() => {
    let active = true
    void getAccountOptions().then(rows => {
      if (!active) return
      setAccounts(rows)
      setAccountId(current => current && rows.some(row => row.value === current) ? current : rows[0]?.value || current)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const accountName = accounts.find(row => row.value === accountId)?.text || localStorage.getItem('account_name') || accountId
  const categories = categoriesByAccount[accountId] ?? DEFAULT_CATEGORIES
  const itemKey = (categoryId: string) => `${accountId}|${inspectionDate}|${categoryId}`
  const itemOf = (categoryId: string) => items[itemKey(categoryId)] ?? EMPTY_ITEM

  const visibleCategories = useMemo(() => categories.filter(category => {
    if (categoryFilter && category.id !== categoryFilter) return false
    return !statusFilter || sanitationStatus(items[`${accountId}|${inspectionDate}|${category.id}`] ?? EMPTY_ITEM) === statusFilter
  }), [categories, categoryFilter, statusFilter, items, accountId, inspectionDate])

  const updateItem = (categoryId: string, patch: (item: SanitationItem) => Partial<SanitationItem>) =>
    setItems(current => {
      const key = itemKey(categoryId)
      const item = current[key] ?? EMPTY_ITEM
      return { ...current, [key]: { ...item, ...patch(item) } }
    })

  const addPhotos = (categoryId: string, side: SanitationSide, files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_PHOTOS - itemOf(categoryId)[side].length
    const added = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, Math.max(0, room))
      .map(file => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, src: URL.createObjectURL(file), name: file.name }))
    if (added.length) updateItem(categoryId, item => ({ [side]: [...item[side], ...added] }))
  }

  const removePhoto = (categoryId: string, side: SanitationSide, photoId: string) => {
    const photo = itemOf(categoryId)[side].find(row => row.id === photoId)
    if (photo) URL.revokeObjectURL(photo.src)
    updateItem(categoryId, item => ({ [side]: item[side].filter(row => row.id !== photoId) }))
    setActivePhoto(current => ({ ...current, [`${categoryId}:${side}`]: 0 }))
  }

  const saveCategories = (next: SanitationCategory[]) => {
    setCategoriesByAccount(current => ({ ...current, [accountId]: next }))
    if (categoryFilter && !next.some(category => category.id === categoryFilter)) setCategoryFilter('')
  }

  const handleGenerateAiNotes = async () => {
    try {
      setIsAiNoteLoading(true)
      setAiNoteMessage('')
      const result = await requestAiSanitationNote({
        vendor_name: accountName,
        inspection_date: inspectionDate,
        inspection_mode: '조치전',
        sections: categories.map(category => ({ key: category.id, title: category.name, before_note: itemOf(category.id).beforeNote, after_note: itemOf(category.id).afterNote })),
      })
      result.sections.forEach(section => {
        if (categories.some(category => category.id === section.key))
          updateItem(section.key, item => ({ beforeNote: section.before_note || item.beforeNote, afterNote: section.after_note || item.afterNote }))
      })
      setAiNoteMessage(result.summary)
    } catch (error) {
      setAiNoteMessage(error instanceof Error ? error.message : 'AI 위생 점검 메모를 생성하지 못했습니다.')
    } finally {
      setIsAiNoteLoading(false)
    }
  }

  return {
    accounts, accountId, setAccountId, accountName, inspectionDate, setInspectionDate, inspector, setInspector,
    statusFilter, setStatusFilter, categoryFilter, setCategoryFilter, categories, visibleCategories, saveCategories,
    itemOf, updateItem, addPhotos, removePhoto, expanded, setExpanded, editing, setEditing, activePhoto, setActivePhoto,
    lightbox, setLightbox, aiNoteMessage, isAiNoteLoading, handleGenerateAiNotes,
  }
}
