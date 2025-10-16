// examples/nest-app/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule, ApiJwtGuard } from '@sistemas-fsa/authz/nest';
import { ItemsController } from './items.controller.ts';

// 👇 IMPORTA el módulo de tokens
import { KcTokenModule } from '@sistemas-fsa/authz/nest';
import { TokenController } from './token.controller.ts';

const parseCsv = (v?: string) =>
  (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

function parseIssuer(issuer: string) {
  // soporta: http://localhost:4444/realms/test
  const m = issuer.match(/^(.*)\/realms\/([^/]+)\/?$/);
  if (!m) throw new Error(`ISSUER inválido: ${issuer}`);
  return { baseUrl: m[1], realm: m[2] };
}

const ISSUER = process.env.ISSUER || 'http://localhost:4444/realms/test';
const { baseUrl, realm } = parseIssuer(ISSUER);

@Module({
  imports: [
    AuthModule.forRoot({
      issuer: ISSUER,
      audience: process.env.AUDIENCE || 'your-api-audience',
      allowedAzpDefault: parseCsv(process.env.ALLOWED_AZP).length
        ? parseCsv(process.env.ALLOWED_AZP)
        : [process.env.FRONT_CLIENT || 'frontend-client-id'],
      requireSucursalDataDefault: false,
      claimNames: { sucursalId: 'sucursalId', codigoExt: 'codigoExt' },
      clockTolerance: 10,
    }),

    // 👇 ESTO ES CLAVE: registra KC_TOKEN_OPTS y expone KcTokenExchangeService
    KcTokenModule.forRoot({
      baseUrl,
      realm,
      clientId: process.env.CLIENT_ID || 'cli',
      clientSecret: process.env.CLIENT_SECRET || 'sec',
      scope: 'openid profile',
      timeoutMs: 8000,
    }),
  ],
  controllers: [ItemsController, TokenController],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (g: ApiJwtGuard) => g,
      inject: [ApiJwtGuard],
    },
  ],
})
export class AppModule {}
