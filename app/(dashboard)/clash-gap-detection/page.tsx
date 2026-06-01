import { Suspense } from 'react'
import { ClashGapSessionsPage } from '@/app/components/clash-gap-detection/clash-gap-sessions-page'

export default function ClashGapDetectionRoutePage() {
  return (
    <Suspense fallback={null}>
      <ClashGapSessionsPage />
    </Suspense>
  )
}
