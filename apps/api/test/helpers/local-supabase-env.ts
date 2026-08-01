const LOCAL_SUPABASE_HOSTS = new Set(['localhost', '127.0.0.1']);

export function canonicalSupabaseUrl(value?: string): string {
  const url = new URL(value ?? 'http://127.0.0.1:54321');
  if (LOCAL_SUPABASE_HOSTS.has(url.hostname)) {
    url.hostname = '127.0.0.1';
  }
  return url.toString().replace(/\/$/, '');
}

export function useSupabaseTestEnvironment(url: string): () => void {
  const originalUrl = process.env.SUPABASE_URL;
  const originalIssuer = process.env.SUPABASE_JWT_ISSUER;

  process.env.SUPABASE_URL = url;

  const parsed = new URL(url);
  if (LOCAL_SUPABASE_HOSTS.has(parsed.hostname)) {
    process.env.SUPABASE_JWT_ISSUER = `${url}/auth/v1`;
  }

  return () => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;

    if (originalIssuer === undefined) delete process.env.SUPABASE_JWT_ISSUER;
    else process.env.SUPABASE_JWT_ISSUER = originalIssuer;
  };
}
