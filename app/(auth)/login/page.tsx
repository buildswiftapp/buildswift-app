'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Building2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { apiFetch } from '@/lib/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) return

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        router.replace('/dashboard')
      }
    }

    void checkSession()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!supabase) {
      setError('Supabase is not configured. Add your Supabase URL and anon key in .env.local.')
      setIsLoading(false)
      return
    }

    if (!formData.email || !formData.password) {
      setError('Please enter your email and password')
      setIsLoading(false)
      return
    }

    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        json: {
          email: formData.email.trim(),
          password: formData.password,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Check your email and password.')
      setIsLoading(false)
      return
    }

    window.location.assign('/dashboard')
  }

  return (
    <div
      className="app-shell grid min-h-screen w-full lg:grid-cols-2"
      style={{ backgroundColor: '#f4f6fb' }}
    >
      <aside
        className="hidden flex-col justify-between p-12 text-white lg:flex"
        style={{ backgroundColor: '#0b1424' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: '#3f63f3' }}
            aria-hidden
          >
            <Building2 className="h-5 w-5" strokeWidth={2.1} />
          </span>
          <span className="text-xl font-bold tracking-tight">BuildSwift</span>
        </div>

        <div className="max-w-xl">
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">
            Construction Document Management,
            <br />
            <span style={{ color: '#3f63f3' }}>Reimagined</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/70">
            Streamline RFIs, Submittals, and Change Orders with AI-powered automation and seamless
            collaboration.
          </p>
        </div>

        <p className="text-xs text-white/50">Trusted by leading construction firms worldwide</p>
      </aside>

      <section className="flex flex-col items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-[420px]">
          <Card className="w-full rounded-xl border-0 shadow-md">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
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
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      autoComplete="current-password"
                    />
                  </Field>
                </FieldGroup>

                {error && (
                  <p className="mt-4 text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="mt-6 h-11 w-full rounded-md text-white hover:brightness-110"
                  style={{ backgroundColor: '#0f1d36' }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {"Don't have an account? "}
                <Link href="/register" className="text-primary hover:underline">
                  Sign up
                </Link>
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
