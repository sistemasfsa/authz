// src/token/kc-token-exchange.service.ts
import { Inject, Injectable } from '@nestjs/common';
import type { TokenResponse } from './kc-token.module';
import { KC_TOKEN_OPTS, KcTokenOptions } from './kc-token.module';

@Injectable()
export class KcTokenExchangeService {
  constructor(@Inject(KC_TOKEN_OPTS) private readonly opts: KcTokenOptions) {}

  /**
   * Intercambia un subject_token (usuario) por un token para `audienceClientId` (API destino).
   */
  async exchange(subjectToken: string, audienceClientId: string, scope?: string): Promise<TokenResponse> {
    const url = `${this.opts.baseUrl}/realms/${encodeURIComponent(this.opts.realm)}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      subject_token: subjectToken,
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: audienceClientId,
    });
    if (scope ?? this.opts.scope) body.set('scope', scope ?? this.opts.scope!);

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Token Exchange HTTP ${res.status}`);
      return (await res.json()) as TokenResponse;
    } finally {
      clearTimeout(to);
    }
  }
}
