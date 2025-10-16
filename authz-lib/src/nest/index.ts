// src/index.ts
export * from "./auth.module";
export * from "./decorators/auth.decorator";
export * from "./decorators/authz.decorator";
export * from "./decorators/public.decorator";
export * from "./guards/api-jwt.guard";
export * from "./tokens";

export * from "../admin/authz-kc.module";
export * from "../admin/authz-admin.module";
export * from "../admin/authz-kc.service";
export * from "../admin/manifest.types";
export * from "../admin/tokens";

export * from './runtime/types';
export * from './runtime/authz-kc-run.module';
export * from './runtime/token-exchange.service';
export * from './runtime/downstream.factory'; // por si tipás el instance
export * from './decorators/inject-downstream-http.decorator';
export { InjectDownstreamHttp } from './decorators/inject-downstream-http.decorator';
export * from './guards/server-audience.guard';
export { AudienceGuard, AudienceGuardFactory } from './guards/server-audience.guard';

export * from "../token/kc-token.module";
export { KcTokenExchangeService } from '../token/kc-token-exchange.service.js';

export type {
  KcTokenService,
  KcTokenOptions,
  TokenResponse,
} from "./tokens";
