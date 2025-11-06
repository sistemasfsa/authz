/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jose from "jose";
import type { AuthModuleOptions, AuthzPolicy } from "../../shared/contracts";
import { AUTHZ_KEY } from "../decorators/authz.decorator";
import { AUTH_OPTIONS } from "../tokens";
import { CLIENT_PERMS_KEY } from "../decorators/perms.decorator";

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

@Injectable()
export class ApiJwtGuard implements CanActivate {
  private jwks: ReturnType<typeof jose.createRemoteJWKSet>;
  private claimSucursal: string;
  private claimCodigoExt: string;

  constructor(
    @Inject(AUTH_OPTIONS) private readonly opts: AuthModuleOptions,
    private readonly reflector: Reflector
  ) {
    this.jwks = jose.createRemoteJWKSet(
      new URL(`${opts.issuer}/protocol/openid-connect/certs`)
    );
    this.claimSucursal = opts.claimNames?.sucursalId ?? "sucursalId";
    this.claimCodigoExt = opts.claimNames?.codigoExt ?? "codigoExt";
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 1) Rutas públicas
    const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    // 2) Extraer y verificar JWT
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers["authorization"];
    const hdr = Array.isArray(raw) ? raw[0] : raw;
    const token =
      typeof hdr === "string" && hdr.startsWith("Bearer ")
        ? hdr.slice(7)
        : undefined;
    if (!token) throw new UnauthorizedException("Missing bearer token");

    let payload: JwtPayload;
    try {
      const verified = await jose.jwtVerify<JwtPayload>(token, this.jwks, {
        issuer: this.opts.issuer,
        clockTolerance: this.opts.clockTolerance ?? 10,
      });
      payload = verified.payload;
    } catch (err) {
      throw new UnauthorizedException(err);
    }

    // 3) Validar audience
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(this.opts.audience)) {
      throw new ForbiddenException("Invalid audience for API");
    }

    // 4) Construir policy efectiva (Authz + ClientPerms fusionados)
    const defaultPolicy: AuthzPolicy = {
      allowedAzp: this.opts.allowedAzpDefault,
      requireSucursalData: this.opts.requireSucursalDataDefault ?? false,
    };

    const policyRaw =
      this.reflector.get<AuthzPolicy>(AUTHZ_KEY, ctx.getHandler()) ??
      this.reflector.get<AuthzPolicy>(AUTHZ_KEY, ctx.getClass()) ??
      defaultPolicy;

    // Permisos declarados con @ClientPerms en clase y método (se fusionan)
    const handlerPerms =
      this.reflector.get<string[]>(CLIENT_PERMS_KEY, ctx.getHandler()) ?? [];
    const classPerms =
      this.reflector.get<string[]>(CLIENT_PERMS_KEY, ctx.getClass()) ?? [];
    const mergedClientPerms = Array.from(
      new Set([...classPerms, ...handlerPerms])
    );

    // Normalizar requiredClientRoles: agregar los perms de @ClientPerms al audience actual
    const audience = this.opts.audience;
    const normalizedReqClientRoles: Record<string, string[]> =
      policyRaw.requiredClientRoles ? { ...policyRaw.requiredClientRoles } : {};

    if (mergedClientPerms.length) {
      const prev = normalizedReqClientRoles[audience] ?? [];
      normalizedReqClientRoles[audience] = Array.from(
        new Set([...prev, ...mergedClientPerms])
      );
    }

    const policy: AuthzPolicy = {
      ...policyRaw,
      requiredClientRoles: Object.keys(normalizedReqClientRoles).length
        ? normalizedReqClientRoles
        : policyRaw.requiredClientRoles,
    };

    // 5) Validaciones de policy
    if (policy.allowedAzp?.length) {
      if (!payload.azp || !policy.allowedAzp.includes(payload.azp)) {
        throw new ForbiddenException("AZP not allowed for this route");
      }
    }

    const realmRoles = payload.realm_access?.roles ?? [];
    if (policy.requiredRealmRoles?.length) {
      const ok = policy.requiredRealmRoles.every((r) => realmRoles.includes(r));
      if (!ok) throw new ForbiddenException("Missing required realm role(s)");
    }

    if (policy.requiredClientRoles) {
      const resAcc = payload.resource_access ?? {};
      for (const [clientId, roles] of Object.entries(
        policy.requiredClientRoles
      )) {
        const clientRoles = resAcc[clientId]?.roles ?? [];
        const ok = roles.every((r) => clientRoles.includes(r));
        if (!ok)
          throw new ForbiddenException(`Missing client role(s) on ${clientId}`);
      }
    }

    // 6) Datos de sucursal (si corresponde)
    const mustSucursal =
      policy.requireSucursalData ??
      this.opts.requireSucursalDataDefault ??
      false;
    const sucursalId = (payload as any)[this.claimSucursal];
    const codigoExt = (payload as any)[this.claimCodigoExt];
    if (mustSucursal && (!sucursalId || !codigoExt)) {
      throw new ForbiddenException("Missing sucursal codes");
    }

    // 7) Armar contexto compacto
    const resourceAccess = payload.resource_access ?? {};
    req.auth = {
      sub: String(payload.sub ?? ""),
      roles: realmRoles,
      azp: String(payload.azp ?? ""),
      sucursalId: sucursalId ? String(sucursalId) : undefined,
      codigoExt: codigoExt ? String(codigoExt) : undefined,
      clientRoles: Object.fromEntries(
        Object.entries(resourceAccess).map(([cid, v]) => [
          cid,
          (v as any)?.roles ?? [],
        ])
      ),
    };

    return true;
  }
}
