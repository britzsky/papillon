import { useState } from 'react'
import WorkspaceIcon from './WorkspaceIcon'
import ImageZoom from './ImageZoom'
import './ProductImage.css'

export default function ProductImage({ src, name, compact = false, zoomable = false, fullSrc }: { src?: string; name: string; compact?: boolean; zoomable?: boolean; fullSrc?: string }) {
  const [failedSource, setFailedSource] = useState('')
  const available = Boolean(src && failedSource !== src)
  const thumbnail = <span className={`product-image${compact ? ' product-image--compact' : ''}`} title={available ? name : '등록된 사진이 없습니다'}>
    {available ? <img src={src} alt={`${name} 상품 사진`} loading="lazy" decoding="async" onError={() => setFailedSource(src || '')} /> : <span role="img" aria-label="상품 사진 없음"><WorkspaceIcon name="product" /></span>}
  </span>
  return zoomable && available && src ? <ImageZoom src={fullSrc || src} fallbackSrc={src} name={name}>{thumbnail}</ImageZoom> : thumbnail
}
