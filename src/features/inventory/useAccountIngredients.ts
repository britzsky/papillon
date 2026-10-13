import { useEffect, useMemo, useState } from 'react'
import { buildApiUrl } from '../../config/api'

export type AccountIngredient = { ingredient_id: string; ingredient_name: string; base_unit: string; category_name: string; product_name?: string; supplier_name?: string; menu_usage_count: number }

/** 공급사 표시 글자(웰스토리는 삼성웰스토리라 '삼') */
export function supplierInitial(name?: string) {
  const supplier = name?.trim() || ''
  if (supplier.includes('웰스토리')) return '삼'
  if (supplier.includes('아워홈')) return '아'
  return supplier.slice(0, 1) || '-'
}

/**
 * 거래처 사용 식자재(메뉴에 쓰는 식자재)와 실제 구매 상품 연결 상태(PC·터치 공용).
 * 같은 식자재를 쓰는 모든 메뉴에 공통 적용된다. 연결 창은 PC의 IngredientProductLinkModal을 같이 쓴다.
 */
export function useAccountIngredients(accountId: string) {
  const [rows, setRows] = useState<AccountIngredient[]>([])
  const [loading, setLoading] = useState(Boolean(accountId))
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)

  useEffect(() => {
    let active = true
    if (!accountId) return
    void fetch(buildApiUrl(`/v2/menu-management/ingredients?${new URLSearchParams({ account_id: accountId })}`))
      .then(async response => { const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw new Error(data.message || '거래처 식자재 조회에 실패했습니다.'); return data as AccountIngredient[] })
      .then(data => { if (active) setRows(data) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountId, revision])

  const filtered = useMemo(() => rows.filter(row => (!missingOnly || !row.product_name)
    && `${row.ingredient_name} ${row.category_name || ''} ${row.product_name || ''}`.toLowerCase().includes(keyword.trim().toLowerCase())), [rows, keyword, missingOnly])
  const missingCount = rows.filter(row => !row.product_name).length

  /** 지금 목록(검색·필터 적용) 순서에서 current 다음의 미연결 식재료(끝이면 처음부터) */
  const nextUnlinked = (current: AccountIngredient | null) => {
    if (!current) return undefined
    const index = filtered.findIndex(row => row.ingredient_id === current.ingredient_id)
    const ordered = index < 0 ? filtered : [...filtered.slice(index + 1), ...filtered.slice(0, index)]
    return ordered.find(row => !row.product_name && row.ingredient_id !== current.ingredient_id)
  }

  const reload = () => { setLoading(true); setError(''); setRevision(r => r + 1) }

  return { rows, filtered, missingCount, loading, error, setError, keyword, setKeyword, missingOnly, setMissingOnly, nextUnlinked, reload, revision }
}
