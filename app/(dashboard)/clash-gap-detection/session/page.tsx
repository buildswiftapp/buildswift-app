'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { SessionLoadingOverlay } from '@/app/components/clash-gap-detection/session-loading-overlay'

const ClashGapDetectionPage = dynamic(
  () =>
    import('@/app/components/clash-gap-detection/clash-gap-detection-page').then(
      (m) => m.ClashGapDetectionPage,
    ),
  {
    ssr: false,
    loading: () => <SessionLoadingOverlay open label="Loading detection tool…" />,
  },
)

export default function ClashGapDetectionSessionRoutePage() {
  return (
    <Suspense fallback={<SessionLoadingOverlay open label="Loading detection tool…" />}>
      <ClashGapDetectionPage />
    </Suspense>
  )
}
