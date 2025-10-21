import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContext } from '../runtime/request-context';

function pickRefreshToken(req: Request): string | undefined {
  // 1) Cookie HTTP-only (recomendado)
  const c = (req as any).cookies || {};
  const cookieRefresh =
    c['kc_refresh'] ||
    c['refresh_token'] ||
    c['refreshToken'] ||
    c['rt'];

  if (cookieRefresh && typeof cookieRefresh === 'string') return cookieRefresh;
  return undefined;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    const auth = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
    const bearer = auth && /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, '') : undefined;

    const refresh = pickRefreshToken(req);

    // Abrimos un ALS scope por request. Agregamos el refresh si existe.
    RequestContext.run({ subjectBearer: bearer, subjectRefresh: refresh }, () => next());
  }
}
