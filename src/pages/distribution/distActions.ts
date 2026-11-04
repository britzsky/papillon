/** 저장 요청 공통: 바쁜 표시·결과 문구 */
export async function runAction(setBusy: (busy: boolean) => void, setNotice: (message: string, failed: boolean) => void, action: () => Promise<{ message?: string } | unknown>, done?: string) {
  setBusy(true)
  setNotice('', false)
  try {
    const result = await action()
    setNotice(done ?? (result as { message?: string } | null)?.message ?? '저장했습니다.', false)
    return true
  } catch (error) {
    setNotice(error instanceof Error ? error.message : '저장하지 못했습니다.', true)
    return false
  } finally {
    setBusy(false)
  }
}
