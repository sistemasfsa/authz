// src/scripts/test-token.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Inject } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import {
  KcTokenModule,
  KC_TOKEN_SVC,
  KcTokenService,
  KcTokenExchangeService,
} from '@sistemas-fsa/authz/nest';

loadEnv(); // lee .env del example

function parseIssuer(issuer: string) {
  // Soporta: http://localhost:4444/realms/test
  const m = issuer.match(/^(.*)\/realms\/([^/]+)\/?$/);
  if (!m) throw new Error(`ISSUER inválido: ${issuer}`);
  return { baseUrl: m[1], realm: m[2] };
}

@Module({
  imports: [
    // 👇 IMPORTANTE: usar forRoot con opciones reales
    KcTokenModule.forRoot((() => {
      const issuerEnv = process.env.ISSUER || 'http://localhost:4444/realms/test';
      const { baseUrl, realm } = parseIssuer(issuerEnv);
      return {
        baseUrl,
        realm,
        clientId: process.env.CLIENT_ID || 'cli',
        clientSecret: process.env.CLIENT_SECRET || 'sec',
        scope: 'openid profile',
        timeoutMs: 8000,
      };
    })()),
  ],
})
class BootstrapModule {
  constructor(
    @Inject(KC_TOKEN_SVC) private readonly svc: KcTokenService,
    private readonly xchg: KcTokenExchangeService,
  ) {
    (async () => {
      // 1) client_credentials con cache
      const t1 = await this.svc.getToken();
      console.log('[client_credentials] ok, exp=', t1.expires_in);

      // 2) token exchange (usa el access_token anterior como subject_token solo para la demo)
      const audience = process.env.AUDIENCE2 || 'target-api-aud';
      const t2 = await this.xchg.exchange(t1.access_token, audience);
      console.log('[token_exchange] ok, aud=', audience, 'exp=', t2.expires_in);

      process.exit(0);
    })().catch((e) => {
      console.error('[test-token] error:', e);
      process.exit(1);
    });
  }
}

async function main() {
  await NestFactory.createApplicationContext(BootstrapModule);
}
main();
