import { registerAs } from '@nestjs/config';

const MAX_PER_MINUTE = 1000;
const MAX_PER_DAY = 10000;

export const quotaConfig = registerAs('quota', () => {
  const parseLimit = (name: string, fallback: string, max: number): number => {
    const raw = process.env[name] ?? fallback;
    if (!/^\d+$/.test(raw)) {
      throw new Error(`${name} must be 1–${max}, got ${raw}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new Error(`${name} must be 1–${max}, got ${raw}`);
    }
    return value;
  };

  const rpm = parseLimit('REQUESTS_PER_MINUTE', '20', MAX_PER_MINUTE);
  const rpd = parseLimit('REQUESTS_PER_DAY', '200', MAX_PER_DAY);

  return { requestsPerMinute: rpm, requestsPerDay: rpd };
});
