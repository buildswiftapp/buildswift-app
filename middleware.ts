import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const AUTH_ROUTES = ['/login', '/register']

function isProtectedPath(pathname: string) {
  if (pathname === '/') return true

  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/billing') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/team') ||
    pathname.startsWith('/help') ||
    pathname.startsWith('/change-orders') ||
    pathname.startsWith('/clash-gap-detection') ||
    pathname.startsWith('/rfis')
  )
}

function redirectWithSessionCookies(url: URL, sessionResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url)
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie)
  }
  return redirectResponse
}

export async function middleware(request: NextRequest) {
  const { response, user, enabled } = await updateSession(request)
  if (!enabled) return response

  const pathname = request.nextUrl.pathname
  const isAuthPath = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  if (isAuthPath && user) {
    return redirectWithSessionCookies(new URL('/dashboard', request.url), response)
  }

  if (isProtectedPath(pathname) && !user) {
    return redirectWithSessionCookies(new URL('/login', request.url), response)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
