import type { Request, Response, NextFunction } from "express";
import * as jose from "jose";
import type { AuthModuleOptions } from "../shared/contracts";

// 👇 Tipos del payload que nos interesan
type RealmAccess = { roles?: string[] };
type ResourceAccess = { [clientId: string]: { roles?: string[] } };
type JwtPayload = {
  sub?: string;
  azp?: string;
  iss?: string;
  aud?: string | string[];
  realm_access?: RealmAccess;
  resource_access?: ResourceAccess;
  [k: string]: unknown;
};

export function authJwt(opts: AuthModuleOptions) {
  const jwks = jose.createRemoteJWKSet(
    new URL(`${opts.issuer}/protocol/openid-connect/certs`)
  );
  const claimSucursal = opts.claimNames?.sucursalId ?? "sucursalId";
  const claimCodigoExt = opts.claimNames?.codigoExt ?? "codigoExt";

  return async function authJwtMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const raw = req.header("authorization") || "";
      const token = raw.startsWith("Bearer ") ? raw.slice(7) : undefined;
      if (!token) return res.status(401).json({ error: "Missing bearer token" });

      // 👇 Tipamos el payload
      const { payload } = await jose.jwtVerify<JwtPayload>(token, jwks, {
        issuer: opts.issuer,
        clockTolerance: opts.clockTolerance ?? 10,
      });

      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(opts.audience)) {
        return res.status(403).json({ error: "Invalid audience for API" });
      }

      const realmRoles: string[] = payload.realm_access?.roles ?? [];
      const resourceAccess = payload.resource_access ?? {};
      const sucursalId = (payload as any)[claimSucursal]
        ? String((payload as any)[claimSucursal])
        : undefined;
      const codigoExt = (payload as any)[claimCodigoExt]
        ? String((payload as any)[claimCodigoExt])
        : undefined;

      req.auth = {
        sub: String(payload.sub ?? ""),
        roles: realmRoles,
        azp: String(payload.azp ?? ""),
        sucursalId,
        codigoExt,
        clientRoles: Object.fromEntries(
          Object.entries(resourceAccess).map(([cid, v]) => [
            cid,
            v?.roles ?? [],
          ])
        ),
      };
      req.tokenPayload = payload;
      next();
    } catch (err: any) {
      return res
        .status(401)
        .json({ error: "Invalid token", detail: err?.message });
    }
  };
}
