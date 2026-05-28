'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { apiFetch } from '@/lib/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) return

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session) {
        router.replace('/dashboard')
      }
    }

    void checkSession()
  }, [router, supabase])

  const handleResendVerification = async () => {
    setError('')
    if (!supabase) {
      setError('Supabase is not configured. Add your Supabase URL and anon key in .env.local.')
      return
    }
    const email = formData.email.trim()
    if (!email) {
      setError('Enter your email above, then resend verification.')
      return
    }
    setIsResending(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      })
      if (resendError) throw resendError
      toast.success('Verification email sent. Check your inbox (and spam).')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend verification email')
    } finally {
      setIsResending(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    if (!supabase) {
      setError('Supabase is not configured. Add your Supabase URL and anon key in .env.local.')
      setIsLoading(false)
      return
    }

    if (!formData.email || !formData.password || !formData.name) {
      setError('Please fill in all required fields')
      setIsLoading(false)
      return
    }

    try {
      const result = await apiFetch<{ message?: string }>('/api/auth/register', {
        method: 'POST',
        json: {
          name: formData.name.trim(),
          email: formData.email.trim(),
          company: formData.company.trim() || formData.name.trim(),
          password: formData.password,
        },
      })
      setSuccessMessage(
        result.message ||
          'Account created. Check your email to verify your account before signing in.'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create account')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo.png"
            alt="BuildSwift"
            width={280}
            height={68}
            className="h-14 w-auto max-w-full object-contain"
            priority
          />
        </div>

        <Card className="app-surface">
          <CardHeader className="text-center">
            <CardTitle>Create an account</CardTitle>
            <CardDescription>
              Start managing your construction documents today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Full Name</FieldLabel>
                  <Input
                    id="name"
                    placeholder="John Smith"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    autoComplete="name"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Work Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    autoComplete="email"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company">Company Name</FieldLabel>
                  <Input
                    id="company"
                    placeholder="Your Construction Company"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    autoComplete="organization"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    autoComplete="new-password"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    autoComplete="new-password"
                  />
                </Field>
              </FieldGroup>

              {error && (
                <p className="mt-4 text-sm text-destructive">{error}</p>
              )}
              {successMessage && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-emerald-600">{successMessage}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isResending}
                      onClick={() => void handleResendVerification()}
                    >
                      {isResending ? 'Resending…' : 'Resend verification email'}
                    </Button>
                  </div>
                </div>
              )}

              <Button type="submit" className="mt-6 w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}
