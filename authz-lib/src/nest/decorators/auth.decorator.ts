import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '../../shared/contracts';

export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.auth as AuthContext;
  },
);
