export const AUTH_OPTIONS = 'AUTH_OPTIONS';


export const CORE_CONFIG = 'CORE_CONFIG';
export const RUNTIME_CONFIG = 'RUNTIME_CONFIG';
export const ASYNC_CFG = 'AUTHZ_ASYNC_CONFIG';

// src/token/kc-token.tokens.ts
export const KC_TOKEN_OPTS = 'KC_TOKEN_OPTS';
export const KC_TOKEN_SVC  = 'KC_TOKEN_SVC';

export interface KcTokenOptions {
  baseUrl: string;  // https://kc.example.com
  realm: string;    // my-realm
  clientId: string; // confidential/public
  clientSecret: string;
  timeoutMs?: number;
  scope?: string;   // "openid profile"
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface KcTokenService {
  getToken(scopeOverride?: string): Promise<TokenResponse>;
}
