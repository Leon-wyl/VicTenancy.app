import type { NextFunction, Request, Response } from 'express';
import { getRequestContext } from '../correlation/correlation.context';

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();
  const requestId = getRequestContext()?.requestId;
  const method = request.method;

  response.once('finish', () => {
    const principal = request.user as { sub?: string } | undefined;
    const route = request.route?.path ? `${request.baseUrl}${request.route.path}` : request.path;
    console.log(
      JSON.stringify({
        request_id: requestId,
        method,
        route,
        status_code: response.statusCode,
        duration_ms: Date.now() - startedAt,
        user_id: principal?.sub ?? null,
      }),
    );
  });

  next();
}
