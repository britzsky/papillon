import type { PointerEvent as ReactPointerEvent } from 'react'
import type { RecipeActionMenuState } from './RecipeActionMenu'
import type { RecipeRequest } from '../api/recipe'

export type OpenRecipeMenu = (state: RecipeActionMenuState) => void

type AiRecipeGestureOptions = {
  orderMenuId?: string
}

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
      openRecipeMenu({ request, x: pointerEvent.clientX, y: pointerEvent.clientY, orderMenuId: options.orderMenuId })
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') {
        return
      }

      clearLongPress()
      longPressTimer = window.setTimeout(() => {
        openRecipeMenu({ request, x: event.clientX, y: event.clientY, orderMenuId: options.orderMenuId })
      }, 650)
    },
    onPointerUp: clearLongPress,
    onPointerLeave: clearLongPress,
    onPointerCancel: clearLongPress,
  }
}
