// src/server/audience.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {jwtDecode} from "jwt-decode";

type Jwt = {
  aud?: string | string[];
  resource_access?: Record<string, { roles?: string[] }>;
  realm_access?: { roles?: string[] };
  sub?: string;
  azp?: string;
};

function includesAud(
  aud: string | string[] | undefined,
  expected: string
): boolean {
  if (!aud) return false;
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

@Injectable()
export class AudienceGuard implements CanActivate {
  constructor(
    private readonly expectedAudience: string,
    private readonly requiredRoles: string[] = []
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth: string | undefined = req.headers["authorization"];
    if (!auth?.toLowerCase().startsWith("bearer "))
      throw new ForbiddenException("Missing bearer");

    const token = auth.slice(7).trim();
    const jwt = jwtDecode<Jwt>(token);

    if (!includesAud(jwt.aud, this.expectedAudience)) {
      throw new ForbiddenException("Invalid audience");
    }

    if (this.requiredRoles.length) {
      const roles = new Set<string>([
        ...(jwt.realm_access?.roles ?? []),
        ...Object.values(jwt.resource_access ?? {}).flatMap(
          (r) => r.roles ?? []
        ),
      ]);
      const ok = this.requiredRoles.every((r) => roles.has(r));
      if (!ok) throw new ForbiddenException("Missing roles");
    }

    // opcional: adjunta identidad para logs
    req.auth = {
      sub: jwt.sub,
      azp: jwt.azp,
      roles: {
        realm: jwt.realm_access?.roles ?? [],
        resource: jwt.resource_access ?? {},
      },
    };
    return true;
  }
}

// factory helper
export const AudienceGuardFactory = (audience: string, roles?: string[]) =>
  new AudienceGuard(audience, roles ?? []);
