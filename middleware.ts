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
    pathname.startsWith('/rfis')
  )
}

export async function middleware(request: NextRequest) {
  const { response, session, enabled } = await updateSession(request)
  if (!enabled) return response

  const pathname = request.nextUrl.pathname
  const isAuthPath = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  if (isAuthPath && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (isProtectedPath(pathname) && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
