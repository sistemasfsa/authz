// src/nest/runtime/downstream.factory.ts
import axios, { AxiosInstance, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import {jwtDecode} from 'jwt-decode';
import { DownstreamConfig } from './types';
import { RequestContext } from './request-context';
import { TokenExchangeService } from './token-exchange.service';

export namespace DownstreamHttp {
  export type Instance = AxiosInstance;
}

type JwtAud = { aud?: string | string[]; sub?: string; azp?: string };

function hasAudience(token: string, audience: string) {
  const { aud } = jwtDecode<JwtAud>(token);
  if (!aud) return false;
  return Array.isArray(aud) ? aud.includes(audience) : aud === audience;
}

function setAuthHeaders(
  req: InternalAxiosRequestConfig,
  bearer: string,
  meta?: { sub?: string; azp?: string }
) {
  const current =
    req.headers instanceof AxiosHeaders
      ? req.headers
      : new AxiosHeaders(req.headers as any);

  current.set('Authorization', `Bearer ${bearer}`);
  if (meta?.sub) current.set('x-auth-sub', meta.sub);
  if (meta?.azp) current.set('x-auth-azp', meta.azp);

  req.headers = current;
}

export class DownstreamFactory {
  constructor(private ex: TokenExchangeService) {}

  build(cfg: DownstreamConfig): DownstreamHttp.Instance {
    const instance = axios.create({
      baseURL: cfg.baseURL,
      timeout: cfg.timeoutMs ?? 5000,
      headers: cfg.defaultHeaders,
    });

    const attempts = cfg.retry?.attempts ?? 1;
    const backoffMs = cfg.retry?.backoffMs ?? 0;

    instance.interceptors.request.use(async (req) => {
      const subjectBearer = RequestContext.getBearer();

      // Jobs/servicios sin bearer → usar client_credentials si está habilitado
      if (!subjectBearer) {
        if (cfg.fallbackClientCredentials) {
          const cc = await this.ex.clientCredentials(cfg.audience);
          setAuthHeaders(req, cc);
          return req;
        }
        throw new Error('Missing subject bearer for token exchange');
      }

      // Si el token ya trae la audience destino → skip exchange
      if (hasAudience(subjectBearer, cfg.audience)) {
        const meta = jwtDecode<JwtAud>(subjectBearer);
        setAuthHeaders(req, subjectBearer, { sub: meta.sub, azp: meta.azp });
        return req;
      }

      // Token exchange
      const exchanged = await this.ex.forAudience(subjectBearer, cfg.audience, {
        fallbackClientCredentials: cfg.fallbackClientCredentials,
      });
      const meta = jwtDecode<JwtAud>(subjectBearer);
      setAuthHeaders(req, exchanged, { sub: meta.sub, azp: meta.azp });
      return req;
    });

    if (attempts > 1) {
      instance.interceptors.response.use(undefined, async (error) => {
        const config: any = error.config;
        if (!config) throw error;
        config.__retryCount = (config.__retryCount ?? 0) + 1;
        if (config.__retryCount < attempts) {
          if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs));
          return instance.request(config);
        }
        throw error;
      });
    }

    return instance;
  }
}
