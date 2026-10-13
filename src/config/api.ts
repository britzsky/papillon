const envApiOrigin = import.meta.env.VITE_API_ORIGIN?.trim()
const envApiPort = import.meta.env.VITE_API_PORT?.trim() ?? '19090'

function getBrowserOriginFromPort(port: string) {
  if (typeof window === 'undefined') {
    return `http://localhost:${port}`
  }

  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:${port}`
}

// '/api' 같은 상대경로는 현재 페이지 origin 기준 절대 URL로 바꾼다 (new URL(API_ORIGIN) 호출부가 있어서 절대 URL이어야 함).
function resolveApiOrigin(origin: string) {
  if (!origin.startsWith('/') || typeof window === 'undefined') return origin
  return `${window.location.origin}${origin.replace(/\/+$/, '')}`
}

export const API_ORIGIN =
  envApiOrigin && envApiOrigin !== ''
    ? resolveApiOrigin(envApiOrigin)
    : getBrowserOriginFromPort(envApiPort)

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}${normalizedPath}`
}
