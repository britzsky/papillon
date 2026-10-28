import { buildApiUrl } from '../config/api'

/** 저장된 식단표로 만드는 부속 서류(기준: 백엔드 docs/MEAL_DOCUMENTS_RULES.md) */
export type MealDocumentType = 'cooking-plan' | 'operation-log' | 'retention-label'

export const MEAL_DOCUMENTS: { type: MealDocumentType; label: string; hint: string }[] = [
  { type: 'cooking-plan', label: '조리계획표', hint: '날짜·끼니별 메뉴와 식재료 총량(엑셀)' },
  { type: 'operation-log', label: '급식운영일지', hint: '하루 한 장, 메뉴·검식·보존식 반입시간·폐기일(엑셀)' },
  { type: 'retention-label', label: '보존식 라벨', hint: '조·중·석식 라벨, A4 한 장에 6장(PDF)' },
]

function fileNameOf(response: Response, fallback: string) {
  const header = response.headers.get('Content-Disposition') || ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded) } catch { /* 아래 기본 이름 */ }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1] || fallback
}

export async function downloadMealDocument(accountId: string, tableId: string, type: MealDocumentType) {
  const params = new URLSearchParams({ account_id: accountId, table_id: tableId })
  const response = await fetch(`${buildApiUrl(`/v2/meal-plans/documents/${type}`)}?${params.toString()}`)
  if (!response.ok) {
    let message = '서류를 만들지 못했습니다.'
    try {
      const body = await response.json() as { message?: string }
      if (body?.message) message = body.message
    } catch { /* 본문 없음 */ }
    throw new Error(message)
  }
  const blob = await response.blob()
  const fallback = `${MEAL_DOCUMENTS.find(d => d.type === type)?.label || '서류'}.${type === 'retention-label' ? 'pdf' : 'xlsx'}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileNameOf(response, fallback)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
