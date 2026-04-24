'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Palette, User } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { apiFetch } from '@/lib/api'
import { parseBrandingPrimaryColor } from '@/lib/branding-utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { toast } from 'sonner'

type BrandingPayload = {
  company_name: string | null
  primary_color: string | null
  logo_url: string | null
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
    if (file.size > 2_000_000) {
      toast.error('Logo must be 2MB or smaller')
      return
    }
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const res = await fetch('/api/settings/branding/logo', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: await authHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setBranding((prev) => ({ ...prev, logo_url: data.logo_url ?? null }))
      toast.success('Logo uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logo upload failed')
    }
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
    <div className="flex flex-col">
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl">
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
              <Card>
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
              <Card>
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
                            company?.subscriptionTier
                              ? company.subscriptionTier.charAt(0).toUpperCase() +
                                company.subscriptionTier.slice(1)
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
              <Card>
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>
                    Company name, primary color, and logo are used on exported document PDFs. Recommended logo
                    dimensions: 500×200px; PNG or JPEG, max 2MB.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {brandingLoading ? (
                    <p className="text-sm text-muted-foreground">Loading branding…</p>
                  ) : (
                    <>
                      <div
                        className="overflow-hidden rounded-lg border border-slate-200 shadow-sm"
                        style={{ borderTopColor: previewPrimary, borderTopWidth: 4 }}
                      >
                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-3">
                          {branding.logo_url ? (
                            // External storage URL; next/image would require host allowlist.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={branding.logo_url}
                              alt=""
                              className="h-10 max-w-[200px] object-contain"
                            />
                          ) : (
                            <div className="h-10 w-24 rounded bg-slate-200" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
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
                            Upload replaces any existing logo. Use Remove to clear it.
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
      </div>
    </div>
  )
}
