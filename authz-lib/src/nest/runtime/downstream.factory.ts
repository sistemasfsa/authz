import axios, {
  AxiosInstance,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from "axios";
import { jwtDecode } from "jwt-decode";
import { DownstreamConfig } from "./types";
import { RequestContext } from "./request-context";
import { TokenExchangeService } from "./token-exchange.service";

export namespace DownstreamHttp {
  export type Instance = AxiosInstance;
}

type JwtAud = { aud?: string | string[]; sub?: string; azp?: string };
type AuthMode = "subject" | "exchange" | "cc";

function hasAudience(token: string, audience: string) {
  const { aud } = jwtDecode<JwtAud>(token);
  if (!aud) return false;
  return Array.isArray(aud) ? aud.includes(audience) : aud === audience;
}

function setAuthHeaders(
  req: InternalAxiosRequestConfig & {
    __authMode?: AuthMode;
    __retry?: boolean;
  },
  bearer: string,
  mode: AuthMode,
  meta?: { sub?: string; azp?: string }
) {
  const current =
    req.headers instanceof AxiosHeaders
      ? req.headers
      : new AxiosHeaders(req.headers as any);

  current.set("Authorization", `Bearer ${bearer}`);
  if (meta?.sub) current.set("x-auth-sub", meta.sub);
  if (meta?.azp) current.set("x-auth-azp", meta.azp);

  req.headers = current;
  req.__authMode = mode;
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

    // ===== Request interceptor: decide auth strategy =====
    instance.interceptors.request.use(async (req: any) => {
      const subjectBearer = RequestContext.getBearer();
      const subjectRefresh = RequestContext.getRefresh();

      // 1) Sin bearer entrante → CC si está habilitado
      if (!subjectBearer) {
        if (cfg.fallbackClientCredentials) {
          const cc = await this.ex.getClientCredentialsCached(cfg.audience);
          setAuthHeaders(req, cc, "cc");
          return req;
        }
        throw new Error("Missing subject bearer for token exchange");
      }

      // 2) Si el bearer ya trae la audience → úsalo directo (modo subject)
      if (hasAudience(subjectBearer, cfg.audience)) {
        const meta = jwtDecode<JwtAud>(subjectBearer);
        setAuthHeaders(req, subjectBearer, "subject", {
          sub: meta.sub,
          azp: meta.azp,
        });
        return req;
      }

      // 3) Intentar exchange (auto: si hay refresh, la lib refresca sola)
      try {
        const subject = subjectRefresh
          ? { accessToken: subjectBearer, refreshToken: subjectRefresh }
          : subjectBearer;

        const exchanged = await this.ex.forAudience(
          subject as any,
          cfg.audience,
          {
            fallbackClientCredentials: cfg.fallbackClientCredentials,
          }
        );
        const meta = jwtDecode<JwtAud>(subjectBearer);
        setAuthHeaders(req, exchanged, "exchange", {
          sub: meta.sub,
          azp: meta.azp,
        });
        return req;
      } catch (e) {
        if (cfg.fallbackClientCredentials) {
          const cc = await this.ex.getClientCredentialsCached(cfg.audience);
          setAuthHeaders(req, cc, "cc");
          return req;
        }
        throw e;
      }
    });

    // ===== Response interceptor: reintento 401 con CC =====
    instance.interceptors.response.use(undefined, async (error) => {
      const req: any = error.config;
      if (!req || error.response?.status !== 401) throw error;

      // Evitar loops
      if (req.__retry) throw error;
      req.__retry = true;

      // Solo vale la pena cambiar a CC si no veníamos ya con CC y está habilitado
      if (cfg.fallbackClientCredentials && req.__authMode !== "cc") {
        const cc = await this.ex.getClientCredentialsCached(cfg.audience);
        setAuthHeaders(req, cc, "cc");
        if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs));
        return instance.request(req);
      }

      // Si configuraste attempts>1, aplicamos contador básico
      if ((cfg.retry?.attempts ?? 1) > 1) {
        req.__retryCount = (req.__retryCount ?? 0) + 1;
        if (req.__retryCount < (cfg.retry?.attempts ?? 1)) {
          if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs));
          return instance.request(req);
        }
      }

      throw error;
    });

    // Reintentos adicionales (4xx/5xx) si configuraste attempts>1 (ya hay lógica arriba para 401)
    if (attempts > 1) {
      instance.interceptors.response.use(undefined, async (error) => {
        const req: any = error.config;
        if (!req) throw error;
        // 401 ya manejado arriba
        if (error.response?.status === 401) throw error;

        req.__retryCount = (req.__retryCount ?? 0) + 1;
        if (req.__retryCount < attempts) {
          if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs));
          return instance.request(req);
        }
        throw error;
      });
    }

    return instance;
  }
}
