import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import logoImage from '../../assets/image/thefull_sign_1.png'
import { requestAiSanitationNote } from '../../api/ai'

export type PhotoSection = {
  key: string
  title: string
  note: string
}

export type SectionNote = {
  before: string
  after: string
}

export type InspectionMode = '조치전' | '조치후'

export const vendorOptions = ['전체 거래처', '더풀 급식센터', '스마일 푸드', '한빛 유통']
export const inspectionModes: InspectionMode[] = ['조치전', '조치후']

export const photoSections: PhotoSection[] = [
  { key: 'kitchen', title: '주방사진', note: '조리대와 바닥 상태를 정리했습니다.' },
  { key: 'refrigerator', title: '냉장고 사진', note: '냉장고 내부 정리와 온도 점검을 완료했습니다.' },
  { key: 'certificate', title: '보건증 부착 사진', note: '보건증 게시 위치를 다시 정돈했습니다.' },
  { key: 'vending', title: '자판기 사진', note: '자판기 외부 청결 상태를 확인했습니다.' },
  { key: 'license', title: '영업신고증 사진', note: '영업신고증 부착 상태를 재점검했습니다.' },
  { key: 'worker', title: '근무자 사진', note: '근무자 위생복과 위생모 착용 상태를 확인했습니다.' },
]

export function getToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

/**
 * 거래처별 위생 점검(PC·터치 공용, 시안): 거래처·일자·조치전/조치후, 항목별 사진·전달내용·조치내용, AI 메모.
 * 주의: 거래처 목록·사진은 아직 고정 시안 값이고 조회·저장 서버 기능이 없다.
 */
export function useVendorSanitation() {
  const [searchParams] = useSearchParams()
  const initialVendor = searchParams.get('type') === 'vendor' ? searchParams.get('name') ?? searchParams.get('q') ?? vendorOptions[0] : vendorOptions[0]
  const selectableVendorOptions = useMemo(
    () => (vendorOptions.includes(initialVendor) ? vendorOptions : [initialVendor, ...vendorOptions]),
    [initialVendor],
  )
  const [vendor, setVendor] = useState(initialVendor)
  const [inspectionDate, setInspectionDate] = useState(getToday())
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>('조치전')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [aiNoteMessage, setAiNoteMessage] = useState('')
  const [isAiNoteLoading, setIsAiNoteLoading] = useState(false)
  const [notes, setNotes] = useState<Record<string, SectionNote>>(() =>
    Object.fromEntries(
      photoSections.map((section) => [
        section.key,
        {
          before: section.note,
          after: '',
        },
      ]),
    ),
  )

  const photoGroups = useMemo(
    () =>
      photoSections.map((section) => ({
        ...section,
        beforeImages: Array.from({ length: 5 }, (_, index) => ({
          id: `${section.key}-before-${index + 1}`,
          src: logoImage,
          alt: `${section.title} 조치전 ${index + 1}`,
          label: `조치전 ${index + 1}`,
        })),
        afterImages: Array.from({ length: 5 }, (_, index) => ({
          id: `${section.key}-after-${index + 1}`,
          src: logoImage,
          alt: `${section.title} 조치후 ${index + 1}`,
          label: `조치후 ${index + 1}`,
        })),
      })),
    [],
  )

  const handleGenerateAiNotes = async () => {
    try {
      setIsAiNoteLoading(true)
      setAiNoteMessage('')
      const result = await requestAiSanitationNote({
        vendor_name: vendor,
        inspection_date: inspectionDate,
        inspection_mode: inspectionMode,
        sections: photoSections.map((section) => ({
          key: section.key,
          title: section.title,
          before_note: notes[section.key]?.before ?? '',
          after_note: notes[section.key]?.after ?? '',
        })),
      })

      setNotes((current) => {
        const next = { ...current }
        result.sections.forEach((section) => {
          next[section.key] = {
            before: section.before_note || next[section.key]?.before || '',
            after: section.after_note || next[section.key]?.after || '',
          }
        })
        return next
      })
      setAiNoteMessage(result.summary)
    } catch (error) {
      setAiNoteMessage(error instanceof Error ? error.message : 'AI 위생 점검 메모를 생성하지 못했습니다.')
    } finally {
      setIsAiNoteLoading(false)
    }
  }

  return { searchParams, initialVendor, selectableVendorOptions, vendor, setVendor, inspectionDate, setInspectionDate, inspectionMode, setInspectionMode, selectedImage, setSelectedImage, aiNoteMessage, setAiNoteMessage, isAiNoteLoading, setIsAiNoteLoading, notes, setNotes, photoGroups, handleGenerateAiNotes }
}
