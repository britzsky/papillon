import { useEffect } from 'react'

/**
 * 터치 화면이 있는 동안 body의 PC 전역 스타일(workspace-ui)을 끄고 터치 테마(t-ui)를 켠다.
 * TouchLayout과, 틀 없이 그리는 터치 화면(로그인 등)이 같이 쓴다.
 */
export function useTouchBody() {
  useEffect(() => {
    const body = document.body
    const hadWorkspaceUi = body.classList.contains('workspace-ui')
    body.classList.remove('workspace-ui')
    body.classList.add('t-ui')
    return () => {
      body.classList.remove('t-ui')
      if (hadWorkspaceUi) body.classList.add('workspace-ui')
    }
  }, [])
}
