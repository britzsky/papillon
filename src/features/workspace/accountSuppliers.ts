import { useEffect, useState } from 'react'
import { getSiteMappings } from '../../api/supplierSites'

/**
 * 관리 거래처 고르기에 공급사 사업장 매핑 표시(2026-10-26 사용자 결정).
 * 웰스토리 = 왼쪽 절반 주황, 아워홈 = 오른쪽 절반 파랑, 둘 다면 반반. 매핑 목록은 본사 전용 API라 본사 계정에서만 읽는다.
 */
export type AccountSuppliers = { welstory: boolean; ourhome: boolean }

export const WELSTORY_TINT = '#ffd8ad'
export const OURHOME_TINT = '#c9ddff'
const BLANK = 'transparent'
const TTL_MS = 60_000

let cache: { at: number; value: Promise<Map<string, AccountSuppliers>> } | null = null

export function loadAccountSuppliers(): Promise<Map<string, AccountSuppliers>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const value = getSiteMappings().then(rows => {
    const map = new Map<string, AccountSuppliers>()
    for (const row of rows) {
      const flags = map.get(row.account_id) ?? { welstory: false, ourhome: false }
      if (row.supplier_code === 'WELSTORY') flags.welstory = true
      if (row.supplier_code === 'OURHOME') flags.ourhome = true
      map.set(row.account_id, flags)
    }
    return map
  }).catch(() => {
    cache = null
    return new Map<string, AccountSuppliers>()
  })
  cache = { at: Date.now(), value }
  return value
}

/** 사업장 매핑을 바꾼 뒤 다음 조회에서 새로 읽게 한다 */
export function forgetAccountSuppliers() { cache = null }

export function useAccountSuppliers(enabled: boolean) {
  const [map, setMap] = useState<Map<string, AccountSuppliers>>(new Map())
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void loadAccountSuppliers().then(value => { if (alive) setMap(value) })
    return () => { alive = false }
  }, [enabled])
  return map
}

/** 배경: 왼쪽 절반 웰스토리(주황) · 오른쪽 절반 아워홈(파랑). 매핑이 없으면 undefined(원래 배경) */
export function supplierBackground(flags?: AccountSuppliers): string | undefined {
  if (!flags || (!flags.welstory && !flags.ourhome)) return undefined
  const left = flags.welstory ? WELSTORY_TINT : BLANK
  const right = flags.ourhome ? OURHOME_TINT : BLANK
  return `linear-gradient(90deg, ${left} 0 50%, ${right} 50% 100%)`
}

/** 글자로도: '웰스토리 · 아워홈' (색을 구분하기 어려운 경우·터치 기본 선택 상자용) */
export function supplierLabel(flags?: AccountSuppliers): string {
  return [flags?.welstory ? '웰스토리' : '', flags?.ourhome ? '아워홈' : ''].filter(Boolean).join(' · ')
}
