import { registerAs } from '@nestjs/config';

const DEFAULT_ORIGIN = 'http://localhost:3000';

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('CORS_ORIGINS contains an empty entry');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`CORS_ORIGINS entry is not a valid origin: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `CORS_ORIGINS entry must use http or https: ${raw}`,
    );
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `CORS_ORIGINS entry must not include a path, query, or fragment: ${raw}`,
    );
  }

  return url.origin;
}

export const corsConfig = registerAs('cors', () => {
  const raw = process.env.CORS_ORIGINS ?? DEFAULT_ORIGIN;
  const origins = raw.split(',').map(normalizeOrigin);
  return { origins };
});
