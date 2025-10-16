// src/runtime/token-exchange.service.ts
import { KcHttp } from "./kc-http";
import { TokenCache } from "./token-cache";
import { AuthzCoreConfig } from "./types";

export class TokenExchangeService {
  private cache: TokenCache;
  constructor(private cfg: AuthzCoreConfig, private kc: KcHttp) {
    this.cache = new TokenCache(cfg.clockSkewSeconds ?? 30);
  }

  async forAudience(
    subjectBearer: string,
    audience: string,
    opts?: {
      fallbackClientCredentials?: boolean;
    }
  ): Promise<string> {
    const cached = this.cache.get(subjectBearer, audience);
    if (cached) return cached;

    try {
      const ex = await this.kc.tokenExchange({
        subjectToken: subjectBearer,
        audience,
      });
      this.cache.set(subjectBearer, audience, ex.access_token);
      return ex.access_token;
    } catch (e) {
      if (opts?.fallbackClientCredentials) {
        const cc = await this.kc.clientCredentials(audience);
        return cc.access_token;
      }
      throw e;
    }
  }

  // util público por si querés CC para jobs
  async clientCredentials(audience?: string): Promise<string> {
    const cc = await this.kc.clientCredentials(audience);
    return cc.access_token;
  }
}
