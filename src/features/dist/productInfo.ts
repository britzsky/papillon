import DOMPurify from 'dompurify'

/**
 * 더채움 유통 상품 상세(2026-11-04): 상세 설명(편집기 HTML)·식품 표시사항·상품정보제공고시.
 * DB(tb_dist_product_content)에는 HTML·JSON으로 저장하지만 입력은 화면의 편집기·입력 칸으로 한다.
 * JSON 모양 {type?, type_name?, items:[{key, label, value}]} — 라벨도 저장하므로 항목 목록이 바뀌어도 예전 값은 그대로 보인다.
 */
export type InfoItem = { key?: string; label: string; value: string }
export type ProductInfo = { type?: string; type_name?: string; items: InfoItem[] }
/** from: 식품 표시사항에서 가져올 항목 key(앞에서부터, 값 있는 것을 줄바꿈으로 합침) */
export type InfoField = { key: string; label: string; hint?: string; long?: boolean; from?: string[] }

export const FOOD_LABEL_FIELDS: InfoField[] = [
  { key: 'product_name', label: '제품명' },
  { key: 'food_type', label: '식품유형', hint: '예: 젓갈, 과채가공품, 수산물' },
  { key: 'report_no', label: '품목보고번호', hint: '가공식품만' },
  { key: 'manufacturer', label: '제조원(업소명·소재지)', long: true },
  { key: 'seller', label: '판매원' },
  { key: 'origin', label: '원산지' },
  { key: 'content', label: '내용량', hint: '예: 1kg(10~12미), 500g(870kcal)' },
  { key: 'ingredients', label: '원재료명 및 함량', long: true, hint: '원산지 포함' },
  { key: 'allergens', label: '알레르기 유발 물질', hint: '예: 대두, 밀, 새우 함유' },
  { key: 'shelf_life', label: '소비기한', hint: '예: 제조일로부터 30일, 별도 표기일까지' },
  { key: 'storage', label: '보관방법', hint: '예: 0~10℃ 냉장 보관' },
  { key: 'nutrition', label: '영양정보', long: true },
  { key: 'packaging', label: '포장재질' },
  { key: 'caution', label: '주의사항', long: true, hint: '예: 이 제품은 … 와 같은 제조시설에서 제조' },
]

/** 상품정보제공고시(전자상거래 상품정보제공 고시) 중 식품 3종 + 직접 입력. 법령 문구는 고시 개정 때 확인 */
export const NOTICE_TYPES: Record<string, { label: string; fields: InfoField[] }> = {
  AGRI_FOOD: {
    label: '농수축산물',
    fields: [
      { key: 'volume', label: '포장단위별 내용물의 용량(중량), 수량, 크기', from: ['content'] },
      { key: 'producer', label: '생산자(수입품은 수입자 함께 표기)', from: ['manufacturer'] },
      { key: 'origin', label: '원산지(농수산물 원산지 표시법)', from: ['origin'] },
      { key: 'dates', label: '제조연월일(포장일 또는 생산연도), 소비기한 또는 품질유지기한', from: ['shelf_life'] },
      { key: 'agri_label', label: '관련 법상 표시사항', long: true, hint: '농·수산물: 유전자변형 여부·지리적표시 / 축산물: 등급·이력관리대상 여부' },
      { key: 'import_notice', label: '수입신고 문구(수입품)', hint: '"수입식품안전관리 특별법에 따른 수입신고를 필함"' },
      { key: 'composition', label: '상품구성' },
      { key: 'storage', label: '보관방법 또는 취급방법', from: ['storage'] },
      { key: 'caution', label: '소비자안전을 위한 주의사항', long: true, from: ['caution', 'allergens'] },
      { key: 'phone', label: '소비자상담 관련 전화번호' },
    ],
  },
  PROCESSED_FOOD: {
    label: '가공식품',
    fields: [
      { key: 'product_name', label: '제품명', from: ['product_name'] },
      { key: 'food_type', label: '식품의 유형', from: ['food_type'] },
      { key: 'producer', label: '생산자 및 소재지(수입품은 생산자·수입자·제조국)', long: true, from: ['manufacturer'] },
      { key: 'dates', label: '제조연월일, 소비기한 또는 품질유지기한', from: ['shelf_life'] },
      { key: 'volume', label: '포장단위별 내용물의 용량(중량), 수량', from: ['content'] },
      { key: 'ingredients', label: '원재료명(원산지 포함) 및 함량', long: true, from: ['ingredients'] },
      { key: 'nutrition', label: '영양성분', long: true, from: ['nutrition'] },
      { key: 'gmo', label: '유전자변형식품 해당 여부' },
      { key: 'caution', label: '소비자안전을 위한 주의사항', long: true, from: ['caution', 'allergens'] },
      { key: 'import_notice', label: '수입신고 문구(수입품)', hint: '"수입식품안전관리 특별법에 따른 수입신고를 필함"' },
      { key: 'phone', label: '소비자상담 관련 전화번호' },
    ],
  },
  HEALTH_FOOD: {
    label: '건강기능식품',
    fields: [
      { key: 'product_name', label: '제품명', from: ['product_name'] },
      { key: 'producer', label: '제조업소 명칭·소재지(수입품은 수입업소·제조업소·수출국)', long: true, from: ['manufacturer'] },
      { key: 'dates', label: '제조연월일, 소비기한 또는 품질유지기한', from: ['shelf_life'] },
      { key: 'volume', label: '포장단위별 내용물의 용량(중량), 수량', from: ['content'] },
      { key: 'ingredients', label: '원료명 및 함량', long: true, from: ['ingredients'] },
      { key: 'nutrition', label: '영양정보', long: true, from: ['nutrition'] },
      { key: 'function', label: '기능정보', long: true },
      { key: 'intake', label: '섭취량·섭취방법, 섭취 시 주의사항 및 부작용 가능성', long: true },
      { key: 'not_medicine', label: '질병 예방·치료를 위한 의약품이 아니라는 문구' },
      { key: 'gmo', label: '유전자변형건강기능식품 해당 여부' },
      { key: 'import_notice', label: '수입신고 문구(수입품)' },
      { key: 'caution', label: '소비자안전을 위한 주의사항', long: true, from: ['caution', 'allergens'] },
      { key: 'phone', label: '소비자상담 관련 전화번호' },
    ],
  },
  OTHER: { label: '직접 입력', fields: [] },
}

/** 서버 값(JSON 글자 또는 객체) → 항목. 모양이 다르면 빈 값 */
export function parseInfo(value: unknown): ProductInfo {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value
    if (!data || typeof data !== 'object' || !Array.isArray((data as ProductInfo).items)) return { items: [] }
    const info = data as ProductInfo
    return {
      type: typeof info.type === 'string' ? info.type : undefined,
      type_name: typeof info.type_name === 'string' ? info.type_name : undefined,
      items: info.items.filter(item => item && typeof item.label === 'string')
        .map(item => ({ key: typeof item.key === 'string' ? item.key : undefined, label: item.label, value: String(item.value ?? '') })),
    }
  } catch { return { items: [] } }
}

/** 화면 값 → 저장할 JSON 글자. 값 있는 항목이 없으면 ''(서버가 비움) */
export function serializeInfo(info: ProductInfo) {
  const items = info.items.map(item => ({ ...item, label: item.label.trim(), value: item.value.trim() })).filter(item => item.label && item.value)
  if (items.length === 0) return ''
  return JSON.stringify({ ...(info.type ? { type: info.type, type_name: info.type_name ?? NOTICE_TYPES[info.type]?.label ?? '' } : {}), items })
}

/** 정해진 항목 + 직접 추가한 항목을 한 목록으로(정해진 항목 먼저, 비어 있어도 칸은 보이게) */
export function withFields(info: ProductInfo, fields: InfoField[]): InfoItem[] {
  const known = new Set(fields.map(field => field.key))
  return [
    ...fields.map(field => ({ key: field.key, label: field.label, value: info.items.find(item => item.key === field.key)?.value ?? '' })),
    ...info.items.filter(item => !item.key || !known.has(item.key)),
  ]
}

const ALLOWED_TAGS = ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col', 'img', 'a']
const ALLOWED_ATTR = ['style', 'href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'target', 'rel']

/** 예전(편집기 전) 상세 설명은 그냥 글 — 태그가 없으면 줄마다 문단으로 */
export function descriptionHtml(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value)
  if (!raw.trim()) return ''
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw
  const escape = (line: string) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return raw.split(/\r?\n/).map(line => `<p>${escape(line)}</p>`).join('')
}

/** 보여 주기 전 한 번 더 거른다(서버도 저장할 때 jsoup으로 거름) */
export function safeDescription(value: unknown) {
  const html = descriptionHtml(value)
  return html ? DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false }) : ''
}
