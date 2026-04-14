'use client'

import { useState } from 'react'
import { Building2, User, Palette } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { user, company } = useApp()
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })
  const [companyForm, setCompanyForm] = useState({
    name: company?.name || '',
  })

  const handleSaveProfile = () => {
    toast.success('Profile updated successfully')
  }

  const handleSaveCompany = () => {
    toast.success('Company settings updated')
  }

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
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Settings</CardTitle>
                  <CardDescription>
                    Manage your personal information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="profile-name">Full Name</FieldLabel>
                        <Input
                          id="profile-name"
                          value={profileForm.name}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, name: e.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="profile-email">Email Address</FieldLabel>
                        <Input
                          id="profile-email"
                          type="email"
                          value={profileForm.email}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, email: e.target.value })
                          }
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
                  <CardDescription>
                    Manage your company information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => { e.preventDefault(); handleSaveCompany(); }}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="company-name">Company Name</FieldLabel>
                        <Input
                          id="company-name"
                          value={companyForm.name}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, name: e.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Subscription Plan</FieldLabel>
                        <Input
                          value={company?.subscriptionTier.charAt(0).toUpperCase() + (company?.subscriptionTier.slice(1) || '')}
                          disabled
                        />
                        <p className="text-sm text-muted-foreground mt-1">
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

          </Tabs>
        </div>
      </div>
    </div>
  )
}
