'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const ClashGapDetectionPage = dynamic(
  () =>
    import('@/app/components/clash-gap-detection/clash-gap-detection-page').then(
      (m) => m.ClashGapDetectionPage,
    ),
  { ssr: false, loading: () => null },
)

export default function ClashGapDetectionSessionRoutePage() {
  return (
    <Suspense fallback={null}>
      <ClashGapDetectionPage />
    </Suspense>
  )
}
