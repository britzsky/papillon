import { API_ORIGIN, buildApiUrl } from '../config/api'
import type { AiRecipeIngredient, AiRecipeRequest } from './ai'

export type RecipeRequest = AiRecipeRequest
export type RecipeIngredient = AiRecipeIngredient

export type RecipeImage = {
  image_id?: string
  file_id?: string
  file?: File
  name: string
  url: string
  is_primary: boolean
}

export type RecipeVideo = {
  video_id?: string
  title: string
  url: string
  description: string
}

export type Recipe = {
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
  images: RecipeImage[]
  videos: RecipeVideo[]
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
    const trimmed = value.trim()

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) {
          return parsed.map((item) => asText(item)).filter(Boolean)
        }
      } catch {
        // Fall through to newline parsing below when the string is not valid JSON.
      }
    }

    return value
      .split(/\r?\n/)
      .map((item) => item.replace(/^\s*[-*\d.]+\s*/, '').trim())
      .filter(Boolean)
  }

  return []
}

function toBackendAssetUrl(value: unknown) {
  const path = asText(value)
  if (path === '') {
    return ''
  }

  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}${normalizedPath}`
}

function readImages(value: unknown): RecipeImage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = (item && typeof item === 'object' ? item : {}) as RawRecord
    return {
      image_id: asText(record.image_id ?? record.imageId),
      file_id: asText(record.file_id ?? record.fileId),
      name: asText(record.name ?? record.file_name ?? record.fileName),
      url: toBackendAssetUrl(record.url ?? record.file_url ?? record.fileUrl),
      is_primary: Boolean(record.is_primary ?? record.isPrimary),
    }
  })
}

function readVideos(value: unknown): RecipeVideo[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = (item && typeof item === 'object' ? item : {}) as RawRecord
    return {
      video_id: asText(record.video_id ?? record.videoId),
      title: asText(record.title),
      url: toBackendAssetUrl(record.url),
      description: asText(record.description),
    }
  })
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

function normalizeRecipe(payload: unknown, request: RecipeRequest): Recipe | null {
  if (!payload) {
    return null
  }

  const record = (payload && typeof payload === 'object' ? payload : {}) as RawRecord
  const recipeRecord = (record.recipe && typeof record.recipe === 'object' ? record.recipe : record) as RawRecord
  const menuName = asText(recipeRecord.menu_name ?? recipeRecord.menuName, request.menu_name)
  const title = asText(recipeRecord.title, menuName ? `${menuName} 레시피` : '레시피')

  if (!menuName && !title) {
    return null
  }

  return {
    recipe_id: asText(recipeRecord.recipe_id ?? recipeRecord.recipeId),
    menu_id: asText(recipeRecord.menu_id ?? recipeRecord.menuId, request.menu_id ?? ''),
    menu_name: menuName,
    title,
    summary: asText(recipeRecord.summary ?? recipeRecord.summary_json ?? recipeRecord.summaryJson),
    servings_note: asText(
      recipeRecord.servings_note ?? recipeRecord.servingsNote ?? recipeRecord.servings_note_json ?? recipeRecord.servingsNoteJson,
    ),
    ingredients: readStringArray(
      recipeRecord.ingredients ?? recipeRecord.ingredients_json ?? recipeRecord.ingredientsJson,
    ),
    steps: readStringArray(recipeRecord.steps ?? recipeRecord.steps_json ?? recipeRecord.stepsJson),
    tips: readStringArray(recipeRecord.tips ?? recipeRecord.tips_json ?? recipeRecord.tipsJson),
    storage: readStringArray(recipeRecord.storage ?? recipeRecord.storage_json ?? recipeRecord.storageJson),
    allergens: readStringArray(
      recipeRecord.allergens ?? recipeRecord.allergens_json ?? recipeRecord.allergensJson,
    ),
    images: readImages(recipeRecord.images ?? recipeRecord.images_json ?? recipeRecord.imagesJson),
    videos: readVideos(recipeRecord.videos ?? recipeRecord.videos_json ?? recipeRecord.videosJson),
  }
}

export function buildEmptyRecipe(request: RecipeRequest): Recipe {
  const ingredients = request.ingredients
    .filter((item) => item.ingredient_name)
    .map((item) => {
      const qty = item.qty_num ?? item.required_qty
      const unit = item.qty_unit || item.base_unit || ''
      return qty && unit ? `${item.ingredient_name} ${qty}${unit}` : item.ingredient_name
    })

  return {
    menu_id: request.menu_id,
    menu_name: request.menu_name,
    title: `${request.menu_name} 대량급식 레시피`,
    summary: '',
    servings_note: '',
    ingredients,
    steps: [''],
    tips: [''],
    storage: [''],
    allergens: [''],
    images: [],
    videos: [],
  }
}

export async function getRecipeDetail(request: RecipeRequest): Promise<Recipe | null> {
  const searchParams = new URLSearchParams()
  if (request.menu_id) {
    searchParams.set('menu_id', request.menu_id)
  }
  if (request.menu_name) {
    searchParams.set('menu_name', request.menu_name)
  }

  const response = await fetch(`${buildApiUrl('/Menu/RecipeList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('레시피를 불러오지 못했습니다.')
  }

  return normalizeRecipe(await parseResponseBody(response), request)
}

export async function saveRecipe(recipe: Recipe, request: RecipeRequest) {
  const recipeJson = {
    recipe: {
      ...recipe,
      menu_id: recipe.menu_id || request.menu_id,
      menu_name: recipe.menu_name || request.menu_name,
    },
  }

  const response = await fetch(buildApiUrl('/Menu/RecipeSave'), {
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
      recipe_json: recipeJson,
      user_id: getLocalUserId(),
    }),
  })

  if (!response.ok) {
    throw new Error('레시피를 저장하지 못했습니다.')
  }

  return parseResponseBody(response)
}
