'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Palette, RotateCcw, RotateCw, User, ZoomIn, ZoomOut } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { apiFetch } from '@/lib/api'
import { parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { toast } from 'sonner'

type BrandingPayload = {
  company_name: string | null
  primary_color: string | null
  logo_url: string | null
}

const LOGO_OUTPUT_SIZE = 500
const MAX_LOGO_BYTES = 2_000_000
const PREVIEW_CANVAS_SIZE = 300
const PREVIEW_FRAME_SIZE = 220
const MIN_ZOOM = 0.2
const MAX_ZOOM = 5

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load selected image'))
    image.src = src
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getBaseScale(image: HTMLImageElement, targetSide: number) {
  const maxDim = Math.max(image.naturalWidth, image.naturalHeight) || 1
  return targetSide / maxDim
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createSupabaseBrowserClient()
  const headers: Record<string, string> = {}
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }
  }
  return headers
}

export default function SettingsPage() {
  const { user, company } = useApp()
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free')
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })
  const [companyForm, setCompanyForm] = useState({
    name: company?.name || '',
  })

  const [brandingLoading, setBrandingLoading] = useState(true)
  const [brandingSaving, setBrandingSaving] = useState(false)
  const [branding, setBranding] = useState<BrandingPayload>({
    company_name: '',
    primary_color: '',
    logo_url: null,
  })
  const [cropOpen, setCropOpen] = useState(false)
  const [logoSourceFileName, setLogoSourceFileName] = useState('logo.png')
  const [logoSourceUrl, setLogoSourceUrl] = useState<string | null>(null)
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropPanX, setCropPanX] = useState(0)
  const [cropPanY, setCropPanY] = useState(0)
  const [cropRotation, setCropRotation] = useState(0)
  const [logoUploading, setLogoUploading] = useState(false)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [logoPreviewReady, setLogoPreviewReady] = useState(false)
  const [draggingPreview, setDraggingPreview] = useState(false)
  const dragStateRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const loadBranding = useCallback(async () => {
    try {
      setBrandingLoading(true)
      const res = await apiFetch<{ branding: BrandingPayload }>('/api/settings/branding')
      const b = res.branding
      setBranding({
        company_name: b.company_name ?? '',
        primary_color: b.primary_color ?? '',
        logo_url: b.logo_url,
      })
    } catch {
      toast.error('Could not load branding settings')
    } finally {
      setBrandingLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBranding()
  }, [loadBranding])

  useEffect(() => {
    return () => {
      if (logoSourceUrl) URL.revokeObjectURL(logoSourceUrl)
    }
  }, [logoSourceUrl])

  const drawCropPreview = useCallback(() => {
    const previewCanvas = previewCanvasRef.current
    if (!previewCanvas || !logoImage || !cropOpen) return false
    const ctx = previewCanvas.getContext('2d')
    if (!ctx) return false
    const size = previewCanvas.width
    const frameX = (size - PREVIEW_FRAME_SIZE) / 2
    const frameY = (size - PREVIEW_FRAME_SIZE) / 2
    const baseScale = getBaseScale(logoImage, PREVIEW_FRAME_SIZE)
    const scale = baseScale * cropZoom

    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, size, size)

    ctx.save()
    ctx.translate(size / 2 + cropPanX, size / 2 + cropPanY)
    ctx.rotate((cropRotation * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.drawImage(logoImage, -logoImage.naturalWidth / 2, -logoImage.naturalHeight / 2)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = 'rgba(2, 6, 23, 0.62)'
    ctx.beginPath()
    ctx.rect(0, 0, size, size)
    ctx.rect(frameX, frameY, PREVIEW_FRAME_SIZE, PREVIEW_FRAME_SIZE)
    ctx.fill('evenodd')
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)'
    ctx.lineWidth = 1.6
    ctx.strokeRect(frameX, frameY, PREVIEW_FRAME_SIZE, PREVIEW_FRAME_SIZE)

    const third = PREVIEW_FRAME_SIZE / 3
    ctx.beginPath()
    ctx.moveTo(frameX + third, frameY)
    ctx.lineTo(frameX + third, frameY + PREVIEW_FRAME_SIZE)
    ctx.moveTo(frameX + third * 2, frameY)
    ctx.lineTo(frameX + third * 2, frameY + PREVIEW_FRAME_SIZE)
    ctx.moveTo(frameX, frameY + third)
    ctx.lineTo(frameX + PREVIEW_FRAME_SIZE, frameY + third)
    ctx.moveTo(frameX, frameY + third * 2)
    ctx.lineTo(frameX + PREVIEW_FRAME_SIZE, frameY + third * 2)
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.55)'
    ctx.lineWidth = 1
    ctx.stroke()

    const handle = 12
    const drawCornerHandle = (x: number, y: number, hDir: 1 | -1, vDir: 1 | -1) => {
      ctx.beginPath()
      ctx.moveTo(x, y + vDir * handle)
      ctx.lineTo(x, y)
      ctx.lineTo(x + hDir * handle, y)
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    drawCornerHandle(frameX, frameY, 1, 1)
    drawCornerHandle(frameX + PREVIEW_FRAME_SIZE, frameY, -1, 1)
    drawCornerHandle(frameX, frameY + PREVIEW_FRAME_SIZE, 1, -1)
    drawCornerHandle(frameX + PREVIEW_FRAME_SIZE, frameY + PREVIEW_FRAME_SIZE, -1, -1)
    ctx.restore()

    return true
  }, [logoImage, cropZoom, cropPanX, cropPanY, cropRotation, cropOpen])

  useEffect(() => {
    if (!cropOpen || !logoImage) {
      setLogoPreviewReady(false)
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = 12

    const tryDraw = () => {
      if (cancelled) return
      const drawn = drawCropPreview()
      if (drawn) {
        setLogoPreviewReady(true)
        return
      }
      attempts += 1
      if (attempts < maxAttempts) {
        window.setTimeout(tryDraw, 25)
      }
    }

    // Dialog content mounts asynchronously, so defer and retry briefly.
    window.requestAnimationFrame(tryDraw)

    return () => {
      cancelled = true
    }
  }, [cropOpen, logoImage, drawCropPreview])

  const resetCropState = useCallback(() => {
    setCropZoom(1)
    setCropPanX(0)
    setCropPanY(0)
    setCropRotation(0)
  }, [])

  const centerCropPosition = useCallback(() => {
    setCropPanX(0)
    setCropPanY(0)
  }, [])

  const fitCropArea = useCallback(() => {
    setCropZoom(1)
    setCropPanX(0)
    setCropPanY(0)
    setCropRotation(0)
  }, [])

  const closeCropDialog = useCallback(() => {
    setCropOpen(false)
    setLogoImage(null)
    setLogoSourceFileName('logo.png')
    if (logoSourceUrl) URL.revokeObjectURL(logoSourceUrl)
    setLogoSourceUrl(null)
    setLogoUploading(false)
    setLogoPreviewReady(false)
    resetCropState()
  }, [logoSourceUrl, resetCropState])

  const uploadLogoBlob = useCallback(async (blob: Blob, fileName: string) => {
    const fd = new FormData()
    fd.append('logo', new File([blob], fileName, { type: blob.type || 'image/png' }))
    const res = await fetch('/api/settings/branding/logo', {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: await authHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Upload failed')
    const baseLogoUrl = data.logo_url ?? null
    const freshLogoUrl = baseLogoUrl
      ? `${baseLogoUrl}${baseLogoUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
      : null
    setBranding((prev) => ({ ...prev, logo_url: freshLogoUrl }))
  }, [])

  const handleSaveProfile = () => {
    toast.success('Profile updated successfully')
  }

  const handleSaveCompany = () => {
    toast.success('Company settings updated')
  }

  const handleSaveBranding = async () => {
    try {
      setBrandingSaving(true)
      await apiFetch('/api/settings/branding', {
        method: 'PUT',
        json: {
          company_name: branding.company_name?.trim() || null,
          primary_color: branding.primary_color?.trim() || null,
        },
      })
      toast.success('Branding saved')
      await loadBranding()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save branding')
    } finally {
      setBrandingSaving(false)
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      toast.error('Logo must be PNG, JPEG, or WebP')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be 2MB or smaller')
      return
    }
    try {
      const objectUrl = URL.createObjectURL(file)
      const image = await loadImage(objectUrl)
      setLogoSourceFileName(file.name || 'logo.png')
      setLogoSourceUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return objectUrl
      })
      setLogoPreviewReady(false)
      setLogoImage(image)
      resetCropState()
      setCropOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not prepare logo editor')
    }
  }

  const handleConfirmCrop = async () => {
    if (!logoImage) return
    try {
      setLogoUploading(true)
      const canvas = document.createElement('canvas')
      canvas.width = LOGO_OUTPUT_SIZE
      canvas.height = LOGO_OUTPUT_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not prepare logo crop output')

      const outputPanScale = LOGO_OUTPUT_SIZE / PREVIEW_FRAME_SIZE
      const baseScale = getBaseScale(logoImage, LOGO_OUTPUT_SIZE)
      const scale = baseScale * cropZoom

      ctx.clearRect(0, 0, LOGO_OUTPUT_SIZE, LOGO_OUTPUT_SIZE)
      ctx.translate(
        LOGO_OUTPUT_SIZE / 2 + cropPanX * outputPanScale,
        LOGO_OUTPUT_SIZE / 2 + cropPanY * outputPanScale,
      )
      ctx.rotate((cropRotation * Math.PI) / 180)
      ctx.scale(scale, scale)
      ctx.drawImage(logoImage, -logoImage.naturalWidth / 2, -logoImage.naturalHeight / 2)

      const blob = await canvasToBlob(canvas, 'image/png', 0.92)
      if (!blob) throw new Error('Could not process logo image')
      if (blob.size > MAX_LOGO_BYTES) {
        throw new Error('Processed logo is larger than 2MB. Reduce zoom or choose a smaller image.')
      }
      const uploadName = logoSourceFileName.replace(/\.[^/.]+$/, '') || 'logo'
      await uploadLogoBlob(blob, `${uploadName}-cropped.png`)
      toast.success('Logo uploaded')
      closeCropDialog()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logo upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  const handlePreviewWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (logoUploading) return
    const delta = e.deltaY > 0 ? -0.06 : 0.06
    setCropZoom((z) => clamp(Number((z + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM))
  }

  const handlePreviewPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!logoImage || logoUploading) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStateRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: cropPanX,
      panY: cropPanY,
    }
    setDraggingPreview(true)
  }

  const handlePreviewPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current || !draggingPreview) return
    const start = dragStateRef.current
    const deltaX = e.clientX - start.x
    const deltaY = e.clientY - start.y
    setCropPanX(Math.round(start.panX + deltaX))
    setCropPanY(Math.round(start.panY + deltaY))
  }

  const handlePreviewPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragStateRef.current = null
    setDraggingPreview(false)
  }

  const handleRemoveLogo = async () => {
    try {
      const res = await fetch('/api/settings/branding/logo', {
        method: 'DELETE',
        credentials: 'include',
        headers: await authHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to remove logo')
      setBranding((prev) => ({ ...prev, logo_url: data.logo_url ?? null }))
      toast.success('Logo removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove logo')
    }
  }

  const previewPrimary = parseBrandingPrimaryColor(branding.primary_color) || '#475569'
  const colorPickerValue = parseBrandingPrimaryColor(branding.primary_color) || '#2C7DA0'

  return (
    <div className="app-page">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="app-section-title">Settings</h1>
          <p className="app-section-subtitle">Profile, company, and branding preferences.</p>
        </div>
          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList>
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="company" className="gap-2">
                <Building2 className="h-4 w-4" />
                Company
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-2">
                <Palette className="h-4 w-4" />
                Branding
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="app-surface">
                <CardHeader>
                  <CardTitle>Profile Settings</CardTitle>
                  <CardDescription>Manage your personal information</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveProfile()
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="profile-name">Full Name</FieldLabel>
                        <Input
                          id="profile-name"
                          value={profileForm.name}
                          onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="profile-email">Email Address</FieldLabel>
                        <Input
                          id="profile-email"
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        />
                      </Field>
                    </FieldGroup>
                    <div className="mt-6">
                      <Button type="submit">Save Changes</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="company">
              <Card className="app-surface">
                <CardHeader>
                  <CardTitle>Company Settings</CardTitle>
                  <CardDescription>Manage your company information</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveCompany()
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="company-name">Company Name</FieldLabel>
                        <Input
                          id="company-name"
                          value={companyForm.name}
                          onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Subscription Plan</FieldLabel>
                        <Input
                          value={
                            subscriptionTier
                              ? subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)
                              : ''
                          }
                          disabled
                        />
                        <p className="mt-1 text-sm text-muted-foreground">
                          <a href="/billing" className="text-primary hover:underline">
                            Manage your subscription
                          </a>
                        </p>
                      </Field>
                    </FieldGroup>
                    <div className="mt-6">
                      <Button type="submit">Save Changes</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding">
              <Card className="app-surface">
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>
                    Company name, primary color, and logo are used on exported document PDFs. Upload an image, then
                    zoom, position, and crop it for PDF branding. PNG, JPEG, or WebP; max 2MB.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {brandingLoading ? (
                    <p className="text-sm text-muted-foreground">Loading branding…</p>
                  ) : (
                    <>
                      <div
                        className="overflow-hidden rounded-lg border border-border shadow-sm"
                        style={{ borderTopColor: previewPrimary, borderTopWidth: 4 }}
                      >
                        <div className="flex items-center gap-3 bg-muted px-4 py-3">
                          {branding.logo_url ? (
                            // External storage URL; next/image would require host allowlist.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={branding.logo_url}
                              alt=""
                              className="h-10 max-w-[200px] object-contain"
                            />
                          ) : (
                            <div className="h-10 w-24 rounded bg-[#d9dde8]" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {branding.company_name?.trim() || 'Company name'}
                            </p>
                            <p className="text-xs text-muted-foreground">PDF header preview</p>
                          </div>
                        </div>
                        <div className="h-1" style={{ backgroundColor: previewPrimary }} />
                      </div>

                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="branding-company">Company name (PDF header)</FieldLabel>
                          <Input
                            id="branding-company"
                            value={branding.company_name ?? ''}
                            onChange={(e) => setBranding((b) => ({ ...b, company_name: e.target.value }))}
                            placeholder="Shown next to your logo on PDFs"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="branding-color">Primary colour</FieldLabel>
                          <div className="flex flex-wrap items-center gap-3">
                            <Input
                              id="branding-color"
                              type="color"
                              className="h-10 w-14 cursor-pointer p-1"
                              value={colorPickerValue}
                              onChange={(e) =>
                                setBranding((b) => ({ ...b, primary_color: e.target.value }))
                              }
                            />
                            <Input
                              className="max-w-xs font-mono text-sm"
                              value={branding.primary_color ?? ''}
                              onChange={(e) => setBranding((b) => ({ ...b, primary_color: e.target.value }))}
                              placeholder="#2C7DA0"
                              aria-label="Primary colour hex"
                            />
                          </div>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="branding-logo">Logo</FieldLabel>
                          <Input
                            id="branding-logo"
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            onChange={handleLogoChange}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Upload opens an editor where you can zoom, pan, and crop before replacing your logo.
                          </p>
                          {branding.logo_url ? (
                            <div className="mt-3">
                              <Button type="button" variant="outline" size="sm" onClick={() => void handleRemoveLogo()}>
                                Remove logo
                              </Button>
                            </div>
                          ) : null}
                        </Field>
                      </FieldGroup>

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void handleSaveBranding()} disabled={brandingSaving}>
                          {brandingSaving ? 'Saving…' : 'Save branding'}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void loadBranding()}>
                          Reload
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      <Dialog open={cropOpen} onOpenChange={(open) => (!open ? closeCropDialog() : setCropOpen(true))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adjust logo crop</DialogTitle>
            <DialogDescription>
              Drag to move, use mouse wheel to zoom, and rotate in 90 degree steps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="mx-auto w-fit rounded-lg border border-slate-200 bg-white p-3">
              <div className="relative flex items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  width={PREVIEW_CANVAS_SIZE}
                  height={PREVIEW_CANVAS_SIZE}
                  onPointerDown={handlePreviewPointerDown}
                  onPointerMove={handlePreviewPointerMove}
                  onPointerUp={handlePreviewPointerUp}
                  onPointerCancel={handlePreviewPointerUp}
                  onWheel={handlePreviewWheel}
                  className={`h-[300px] w-[300px] rounded border border-slate-800 bg-slate-900 ${
                    logoUploading ? 'cursor-wait' : draggingPreview ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                />
                {!logoPreviewReady ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded border border-slate-800 bg-slate-900/85 text-xs text-slate-200">
                    Preparing preview...
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCropRotation((r) => (r + 270) % 360)}
                disabled={logoUploading}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Rotate left 90°
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCropRotation((r) => (r + 90) % 360)}
                disabled={logoUploading}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                Rotate right 90°
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCropDialog} disabled={logoUploading}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={resetCropState} disabled={logoUploading}>
              Reset
            </Button>
            <Button type="button" onClick={() => void handleConfirmCrop()} disabled={logoUploading || !logoImage}>
              {logoUploading ? 'Uploading…' : 'Crop and upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
