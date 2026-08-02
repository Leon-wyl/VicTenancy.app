import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { safeRedirectPath } from '@/lib/auth/redirect';

const AUTH_LEAF_PATHS = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/update-password',
  '/auth/callback',
]);

function isAuthRelevantPath(pathname: string): boolean {
  if (AUTH_LEAF_PATHS.has(pathname)) return true;
  if (pathname === '/app' || pathname.startsWith('/app/')) return true;
  return false;
}

function isProtectedPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

function isAuthGatePath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/signup';
}

function redirectWithSessionCookies(url: URL, source: NextResponse): NextResponse {
  const response = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Avoid initializing Supabase for unrelated public requests so the landing
  // page and other public routes remain renderable without Auth env values.
  if (!isAuthRelevantPath(pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect /app and future /app/:path* routes.
  if (isProtectedPath(pathname) && !user) {
    const next = safeRedirectPath(`${pathname}${search}`);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', next);
    return redirectWithSessionCookies(loginUrl, supabaseResponse);
  }

  // Redirect authenticated users away from login/signup.
  if (isAuthGatePath(pathname) && user) {
    return redirectWithSessionCookies(
      new URL('/app', request.url),
      supabaseResponse,
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
