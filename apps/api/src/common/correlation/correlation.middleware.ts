import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { runInRequestContext } from './correlation.context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const candidate = req.headers['x-request-id'];
  const requestId =
    typeof candidate === 'string' && UUID_RE.test(candidate)
      ? candidate
      : randomUUID();

  res.setHeader('X-Request-Id', requestId);
  runInRequestContext({ requestId }, () => next());
}
