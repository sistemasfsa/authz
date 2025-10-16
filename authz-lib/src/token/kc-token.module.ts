// src/token/kc-token.module.ts
import { DynamicModule, Module } from '@nestjs/common';
import { KcTokenExchangeService } from './kc-token-exchange.service';

export interface KcTokenOptions {
  baseUrl: string;  // https://kc.example.com
  realm: string;    // my-realm
  clientId: string; // public/confidential (lo habitual: confidential)
  clientSecret: string;
  timeoutMs?: number;
  scope?: string;   // opcional: "openid profile"
}

export const KC_TOKEN_OPTS = Symbol('KC_TOKEN_OPTS');
export const KC_TOKEN_SVC  = Symbol('KC_TOKEN_SVC');

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface KcTokenService {
  getToken(scopeOverride?: string): Promise<TokenResponse>;
}

@Module({})
export class KcTokenModule {
  static forRoot(opts: KcTokenOptions): DynamicModule {
    return {
      module: KcTokenModule,
      providers: [
        { provide: KC_TOKEN_OPTS, useValue: opts },
        {
          provide: KC_TOKEN_SVC,
          useFactory: (o: KcTokenOptions): KcTokenService => {
            let cached: { token: TokenResponse; expAt: number } | null = null;

            async function fetchToken(scope?: string): Promise<TokenResponse> {
              const url = `${o.baseUrl}/realms/${encodeURIComponent(o.realm)}/protocol/openid-connect/token`;
              const body = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: o.clientId,
                client_secret: o.clientSecret,
              });
              if (scope ?? o.scope) body.set('scope', scope ?? o.scope!);

              const controller = new AbortController();
              const to = setTimeout(() => controller.abort(), o.timeoutMs ?? 10000);
              try {
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'content-type': 'application/x-www-form-urlencoded' },
                  body: body.toString(),
                  signal: controller.signal,
                });
                if (!res.ok) throw new Error(`Token HTTP ${res.status}`);
                const json = (await res.json()) as TokenResponse;
                return json;
              } finally {
                clearTimeout(to);
              }
            }

            return {
              async getToken(scopeOverride?: string): Promise<TokenResponse> {
                const now = Date.now();
                if (cached && cached.expAt - now > 30_000) {
                  return cached.token;
                }
                const t = await fetchToken(scopeOverride);
                cached = { token: t, expAt: now + (t.expires_in * 1000) };
                return t;
              },
            };
          },
          inject: [KC_TOKEN_OPTS],
        },
        KcTokenExchangeService,
      ],
      exports: [KC_TOKEN_SVC, KC_TOKEN_OPTS, KcTokenExchangeService],
    };
  }
}
