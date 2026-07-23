import { buildApiUrl } from '../config/api'

export type AiRecipeIngredient = {
  ingredient_id?: string
  ingredient_name: string
  category_name?: string
  required_qty?: number
  qty_num?: number
  qty_unit?: string
  base_unit?: string
}

export type AiRecipeRequest = {
  menu_id?: string
  menu_name: string
  account_id?: string
  account_name?: string
  source: 'menu-manager' | 'account-menu-manager' | 'table-meals'
  ingredients: AiRecipeIngredient[]
}

export type AiRecipe = {
  recipe_id?: string
  menu_id?: string
  menu_name: string
  title: string
  summary: string
  servings_note: string
  ingredients: string[]
  steps: string[]
  tips: string[]
  storage: string[]
  allergens: string[]
  generated_at?: string
  raw_text?: string
}

export type AiSanitationNoteSection = {
  key: string
  title: string
  before_note: string
  after_note?: string
}

export type AiSanitationNoteRequest = {
  vendor_name: string
  inspection_date: string
  inspection_mode: string
  sections: AiSanitationNoteSection[]
}

export type AiSanitationNoteResponse = {
  summary: string
  sections: AiSanitationNoteSection[]
}

export type AiTableMealsMatchRequest = {
  account_id?: string
  account_name?: string
  extracted_menus: string[]
  menu_candidates: Array<{
    menu_id: string
    menu_name: string
    meal_category?: string
  }>
}

export type AiTableMealsMatchResponse = {
  matches: Array<{
    text: string
    menu_id: string
    menu_name: string
    confidence?: number
  }>
}

type RawRecord = Record<string, unknown>

function getLocalUserId() {
  return typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : ''
}

function asText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return fallback
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean)
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(/\r?\n/)
      .map((item) => item.replace(/^\s*[-*\d.]+\s*/, '').trim())
      .filter(Boolean)
  }

  return []
}

async function parseResponseBody(response: Response) {
  const text = await response.text()
  if (text.trim() === '') {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function normalizeAiRecipe(payload: unknown, fallback: AiRecipeRequest): AiRecipe {
  const record = (payload && typeof payload === 'object' ? payload : {}) as RawRecord
  const nested = (record.recipe && typeof record.recipe === 'object' ? record.recipe : record) as RawRecord

  const title = asText(nested.title ?? nested.recipe_title ?? nested.recipeTitle, `${fallback.menu_name} 레시피`)
  const summary = asText(nested.summary ?? nested.description ?? nested.recipe_summary)
  const steps = readStringArray(nested.steps ?? nested.cooking_steps ?? nested.cookingSteps ?? nested.method)

  return {
    recipe_id: asText(nested.recipe_id ?? nested.recipeId),
    menu_id: asText(nested.menu_id ?? nested.menuId, fallback.menu_id ?? ''),
    menu_name: asText(nested.menu_name ?? nested.menuName, fallback.menu_name),
    title,
    summary: summary || `${fallback.menu_name} 조리 흐름을 AI가 정리했습니다.`,
    servings_note: asText(nested.servings_note ?? nested.servingsNote ?? nested.portion_note),
    ingredients: readStringArray(nested.ingredients ?? nested.ingredient_list ?? nested.ingredientList),
    steps,
    tips: readStringArray(nested.tips ?? nested.service_tips ?? nested.serviceTips),
    storage: readStringArray(nested.storage ?? nested.holding ?? nested.safety_notes ?? nested.safetyNotes),
    allergens: readStringArray(nested.allergens ?? nested.allergen_notes ?? nested.allergenNotes),
    generated_at: asText(nested.generated_at ?? nested.generatedAt, new Date().toISOString()),
    raw_text: typeof payload === 'string' ? payload : asText(nested.raw_text ?? nested.rawText),
  }
}

function buildFallbackRecipe(request: AiRecipeRequest): AiRecipe {
  const ingredientLines = request.ingredients
    .filter((item) => item.ingredient_name)
    .map((item) => {
      const qty = item.qty_num ?? item.required_qty
      const unit = item.qty_unit || item.base_unit || ''
      return qty && unit ? `${item.ingredient_name} ${qty}${unit}` : item.ingredient_name
    })

  return {
    menu_id: request.menu_id,
    menu_name: request.menu_name,
    title: `${request.menu_name} 레시피`,
    summary: 'AI 서버가 연결되면 이 영역에 메뉴별 조리 요약이 표시됩니다.',
    servings_note: '대량 급식 기준 인원수와 배식 기준은 백엔드에서 함께 전달하면 더 정확하게 생성됩니다.',
    ingredients: ingredientLines.length > 0 ? ingredientLines : ['등록된 식자재 정보가 없으면 메뉴명을 기준으로 초안을 생성합니다.'],
    steps: [
      '식자재 검수 후 전처리합니다.',
      '메뉴 특성에 맞게 가열, 볶음, 조림 등 주요 조리를 진행합니다.',
      '배식 전 간, 온도, 이물 여부를 확인합니다.',
    ],
    tips: ['우클릭 또는 롱터치로 다시 열어 최신 식자재 기준 레시피를 요청할 수 있습니다.'],
    storage: ['조리 후 온장 또는 냉장 기준을 지켜 보관합니다.'],
    allergens: ['알레르기 정보는 식자재 마스터와 연동해 표시하는 것을 권장합니다.'],
    generated_at: new Date().toISOString(),
  }
}

export async function requestAiRecipe(request: AiRecipeRequest): Promise<AiRecipe> {
  const response = await fetch(buildApiUrl('/AI/RecipeGenerate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      user_id: getLocalUserId(),
    }),
  })

  if (response.status === 404) {
    return buildFallbackRecipe(request)
  }

  if (!response.ok) {
    throw new Error('AI 레시피를 불러오지 못했습니다.')
  }

  return normalizeAiRecipe(await parseResponseBody(response), request)
}

export async function saveAiRecipe(recipe: AiRecipe, request: AiRecipeRequest) {
  const response = await fetch(buildApiUrl('/AI/RecipeSave'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...recipe,
      menu_id: recipe.menu_id || request.menu_id,
      menu_name: recipe.menu_name || request.menu_name,
      account_id: request.account_id ?? '',
      account_name: request.account_name ?? '',
      source: request.source,
      ingredients: request.ingredients,
      user_id: getLocalUserId(),
    }),
  })

  if (!response.ok) {
    throw new Error('AI 레시피를 저장하지 못했습니다.')
  }

  return parseResponseBody(response)
}

export async function requestAiSanitationNote(request: AiSanitationNoteRequest): Promise<AiSanitationNoteResponse> {
  const response = await fetch(buildApiUrl('/AI/SanitationNoteGenerate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      user_id: getLocalUserId(),
    }),
  })

  if (response.status === 404) {
    return {
      summary: 'AI 서버가 연결되면 사진과 점검 조건을 바탕으로 위생 점검 메모를 자동 생성합니다.',
      sections: request.sections.map((section) => ({
        ...section,
        before_note: section.before_note || `${section.title} 조치 전 상태를 확인했습니다.`,
        after_note: section.after_note || `${section.title} 조치 후 정리 상태를 확인했습니다.`,
      })),
    }
  }

  if (!response.ok) {
    throw new Error('AI 위생 점검 메모를 생성하지 못했습니다.')
  }

  const payload = (await parseResponseBody(response)) as RawRecord | null
  const sections = Array.isArray(payload?.sections)
    ? payload.sections.map((item) => {
        const record = item as RawRecord
        return {
          key: asText(record.key),
          title: asText(record.title),
          before_note: asText(record.before_note ?? record.beforeNote),
          after_note: asText(record.after_note ?? record.afterNote),
        }
      })
    : request.sections

  return {
    summary: asText(payload?.summary, 'AI 위생 점검 메모가 생성되었습니다.'),
    sections,
  }
}

export async function requestAiTableMealsMatch(request: AiTableMealsMatchRequest): Promise<AiTableMealsMatchResponse> {
  const response = await fetch(buildApiUrl('/AI/TableMealsMatch'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      user_id: getLocalUserId(),
    }),
  })

  if (response.status === 404) {
    return { matches: [] }
  }

  if (!response.ok) {
    throw new Error('AI 식단표 메뉴 매칭을 실행하지 못했습니다.')
  }

  const payload = (await parseResponseBody(response)) as RawRecord | null
  const matches = Array.isArray(payload?.matches)
    ? payload.matches.map((item) => {
        const record = item as RawRecord
        return {
          text: asText(record.text),
          menu_id: asText(record.menu_id ?? record.menuId),
          menu_name: asText(record.menu_name ?? record.menuName),
          confidence: typeof record.confidence === 'number' ? record.confidence : undefined,
        }
      })
    : []

  return { matches }
}
