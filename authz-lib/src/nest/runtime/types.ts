// src/runtime/types.ts
export type AuthzCoreConfig = {
  realmUrl: string; // e.g., http://kc/realms/myrealm (no trailing slash requerido)
  clientId: string;
  clientSecret: string;
  tokenEndpointPath?: string; // default: /protocol/openid-connect/token
  clockSkewSeconds?: number; // default: 30
};

export type DownstreamRetry = { attempts: number; backoffMs: number };

export type DownstreamConfig = {
  name: string; // 'clientes'
  baseURL: string;
  audience: string; // audience/clientId destino en KC
  timeoutMs?: number; // default: 5000
  retry?: DownstreamRetry; // default: {attempts:1, backoffMs:0}
  defaultHeaders?: Record<string, string>;
  fallbackClientCredentials?: boolean; // default: false
};

export type AuthzRuntimeConfig = {
  downstreams: DownstreamConfig[];
};

export type ExchangeResult = {
  access_token: string;
  expires_in: number;
  issued_token_type?: string;
  token_type: "Bearer" | string;
  scope?: string;
};
