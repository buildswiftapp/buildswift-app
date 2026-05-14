import { Suspense } from 'react'
import { ClashGapDetectionPage } from '@/app/components/clash-gap-detection/clash-gap-detection-page'

export default function ClashGapDetectionRoutePage() {
  return (
    <Suspense fallback={null}>
      <ClashGapDetectionPage />
    </Suspense>
  )
}
