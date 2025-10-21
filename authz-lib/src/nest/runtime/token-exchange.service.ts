import { KcHttp } from "./kc-http";
import { TokenCache } from "./token-cache";
import { AuthzCoreConfig } from "./types";
import { jwtDecode } from "jwt-decode";

type Jwt = { exp?: number };

export class TokenExpiredError extends Error {
  constructor() {
    super("ACCESS_TOKEN_EXPIRED");
    this.name = "TokenExpiredError";
  }
}

type SubjectTokens =
  | string
  | {
      accessToken: string;
      refreshToken?: string;
    };

function epochNow(): number {
  return Math.floor(Date.now() / 1000);
}

function expOf(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const decoded = jwtDecode<Jwt>(token);
  return decoded.exp;
}

function isExpiringOrExpired(
  accessToken: string,
  skewSeconds: number
): boolean {
  const exp = expOf(accessToken);
  if (!exp) return false; // si no tiene exp, asumimos válido (o dejar false para no bloquear)
  const now = epochNow();
  return now >= exp - skewSeconds;
}

export class TokenExchangeService {
  private exchangeCache: TokenCache;
  // cache separado para CC, la key es audience||'__none__'
  private ccMap = new Map<string, { token: string; exp: number }>();

  constructor(private cfg: AuthzCoreConfig, private kc: KcHttp) {
    this.exchangeCache = new TokenCache(cfg.clockSkewSeconds ?? 30);
  }

  /**
   * Intercambia un token de sujeto por un token con audiencia dada.
   *
   * - Si pasás string: se usa tal cual (comportamiento anterior).
   * - Si pasás { accessToken, refreshToken }:
   *   - Si el access está vencido o por vencer, intenta refresh con refresh_token.
   *   - Si no hay refresh_token o falla, lanza TokenExpiredError.
   */
  async forAudience(
    subject: SubjectTokens,
    audience: string,
    opts?: { fallbackClientCredentials?: boolean }
  ): Promise<string> {
    const skew = this.cfg.clockSkewSeconds ?? 30;

    // Normalizar / refrescar sujeto si viene con refresh_token
    const { accessToken: subjectBearer } = await this.ensureFreshSubject(
      subject,
      skew
    );

    // CACHE por (subjectBearer, audience) — mismo comportamiento que ya tenías
    const cached = this.exchangeCache.get(subjectBearer, audience);
    if (cached) return cached;

    try {
      const ex = await this.kc.tokenExchange({
        subjectToken: subjectBearer,
        audience,
      });
      this.exchangeCache.set(subjectBearer, audience, ex.access_token);
      return ex.access_token;
    } catch (e) {
      if (opts?.fallbackClientCredentials) {
        return this.getClientCredentialsCached(audience);
      }
      throw e;
    }
  }

  // === Client Credentials ===

  async clientCredentials(audience?: string): Promise<string> {
    // público sin cache (si lo querés explícito)
    const cc = await this.kc.clientCredentials(audience);
    return cc.access_token;
  }

  async getClientCredentialsCached(audience?: string): Promise<string> {
    const key = audience ?? "__none__";
    const now = epochNow();

    const hit = this.ccMap.get(key);
    if (hit && hit.exp - (this.cfg.clockSkewSeconds ?? 30) > now) {
      return hit.token;
    }

    const res = await this.kc.clientCredentials(audience);
    const decodedExp = expOf(res.access_token);
    const exp = decodedExp ?? now + 60;
    this.ccMap.set(key, { token: res.access_token, exp });
    return res.access_token;
  }

  // === Helpers ===

  /**
   * Garantiza que el subject (access token del usuario) esté fresco.
   * - Si subject es string, lo devuelve tal cual.
   * - Si subject trae refresh_token y el access expira/próx. a expirar, intenta refresh.
   * - Si no hay refresh o falla (invalid_grant), lanza TokenExpiredError.
   */
  private async ensureFreshSubject(
    subject: SubjectTokens,
    skewSeconds: number
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    if (typeof subject === "string") {
      // No sabemos refresh_token ⇒ no podemos refrescar; usamos tal cual
      return { accessToken: subject };
    }

    const { accessToken, refreshToken } = subject;

    if (!isExpiringOrExpired(accessToken, skewSeconds)) {
      return { accessToken, refreshToken };
    }

    // Está por expirar/expirado ⇒ intentamos refresh si hay
    if (!refreshToken) {
      // No hay refresh ⇒ forzamos al caller a desloguear o manejar error
      throw new TokenExpiredError();
    }

    try {
      const refreshed = await this.kc.refreshWithRefreshToken({
        refreshToken,
      });
      const newAccess = refreshed.access_token;
      const newRefresh = refreshed.refresh_token ?? refreshToken; // algunos proveedores no rotan refresh

      // Si por algún motivo no vino access nuevo, consideramos expirado
      if (!newAccess) {
        throw new TokenExpiredError();
      }

      return { accessToken: newAccess, refreshToken: newRefresh };
    } catch (err: any) {
      // Si KC devuelve invalid_grant, el refresh expiró o fue revocado
      // En cualquier caso, propagamos estado de sesión expirada
      throw new TokenExpiredError();
    }
  }
}
