import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function validateSafePath(input: string): string {
  if (!input || !input.startsWith('/')) return '/';
  if (input.includes('//') || input.includes('\\')) return '/';
  if (input.includes('@') || input.includes('://')) return '/';
  const decoded = decodeURIComponent(input);
  if (decoded.includes('//') || decoded.includes('\\')) return '/';
  return input;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safePath = validateSafePath(next);

  if (code) {
    const response = NextResponse.redirect(`${origin}${safePath}`);

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
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=callback_failed`);
}
