import { useState } from 'react'
import { MEAL_DOCUMENTS, downloadMealDocument, type MealDocumentType } from '../../api/mealDocuments'

/**
 * 저장된 식단표의 부속 서류 받기(조리계획표·급식운영일지 엑셀, 보존식 라벨 PDF). PC·m버전 공용 — 버튼 모양은 buttonClassName으로.
 * 끼니 시간은 서버가 ERP 거래처 정보에서 읽는다(식사 구성에 시간 없음).
 */
export default function MealDocumentButtons({ accountId, tableId, buttonClassName, className }: {
  accountId: string
  tableId: string
  buttonClassName: string
  className?: string
}) {
  const [busy, setBusy] = useState<MealDocumentType | ''>('')
  const [error, setError] = useState('')

  const download = async (type: MealDocumentType) => {
    setBusy(type)
    setError('')
    try {
      await downloadMealDocument(accountId, tableId, type)
    } catch (e) {
      setError(e instanceof Error ? e.message : '서류를 만들지 못했습니다.')
    } finally {
      setBusy('')
    }
  }

  return <div className={className} role="group" aria-label="식단표 서류 받기">
    {MEAL_DOCUMENTS.map(doc => (
      <button key={doc.type} type="button" className={buttonClassName} title={doc.hint}
        disabled={!accountId || !tableId || busy !== ''} onClick={() => void download(doc.type)}>
        {busy === doc.type ? '만드는 중…' : doc.label}
      </button>
    ))}
    {error ? <span role="alert" style={{ color: '#c0392b', fontSize: '0.9em' }}>{error}</span> : null}
  </div>
}
