const envApiOrigin = import.meta.env.VITE_API_ORIGIN?.trim()
const envApiPort = import.meta.env.VITE_API_PORT?.trim() ?? '9090'

function getBrowserOriginFromPort(port: string) {
  if (typeof window === 'undefined') {
    return `http://localhost:${port}`
  }

  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:${port}`
}

export const API_ORIGIN =
  envApiOrigin && envApiOrigin !== ''
    ? envApiOrigin
    : getBrowserOriginFromPort(envApiPort)

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}${normalizedPath}`
}
