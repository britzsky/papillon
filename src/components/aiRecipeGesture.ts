import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RecipeActionMenuState } from './RecipeActionMenu'
import type { RecipeRequest } from '../api/recipe'

export type OpenRecipeMenu = (state: RecipeActionMenuState) => void

type AiRecipeGestureOptions = {
  orderMenuId?: string
  extraAction?: RecipeActionMenuState['extraAction']
}

// 길게 누르기로 메뉴를 연 직후 손을 떼며 생기는 클릭(메뉴 추가 등)은 무시한다.
// 메뉴가 열리며 다시 그려져 핸들러가 새로 만들어지므로 렌더와 상관없는 모듈 값으로 둔다.
let suppressClickUntil = 0

export function createAiRecipeGestureHandlers(
  request: RecipeRequest,
  openRecipeMenu: OpenRecipeMenu,
  options: AiRecipeGestureOptions = {},
) {
  let longPressTimer: number | undefined

  const clearLongPress = () => {
    if (longPressTimer !== undefined) {
      window.clearTimeout(longPressTimer)
      longPressTimer = undefined
    }
  }

  return {
    onContextMenu: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault()
      event.stopPropagation()
      const pointerEvent = event as MouseEvent
      openRecipeMenu({ request, x: pointerEvent.clientX, y: pointerEvent.clientY, orderMenuId: options.orderMenuId, extraAction: options.extraAction })
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') {
        return
      }

      clearLongPress()
      longPressTimer = window.setTimeout(() => {
        suppressClickUntil = Date.now() + 800
        openRecipeMenu({ request, x: event.clientX, y: event.clientY, orderMenuId: options.orderMenuId, extraAction: options.extraAction })
      }, 650)
    },
    onClickCapture: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (Date.now() < suppressClickUntil) {
        suppressClickUntil = 0
        event.preventDefault()
        event.stopPropagation()
      }
    },
    onPointerUp: clearLongPress,
    onPointerLeave: clearLongPress,
    onPointerCancel: clearLongPress,
  }
}
