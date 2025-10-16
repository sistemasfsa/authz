import type { Request, Response, NextFunction } from 'express';
import type { AuthzPolicy } from '../shared/contracts';

export function authorize(policy: AuthzPolicy) {
  return function authorizeMiddleware(req: Request, res: Response, next: NextFunction) {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: 'Unauthenticated' });

    if (policy.allowedAzp?.length) {
      if (!auth.azp || !policy.allowedAzp.includes(auth.azp)) {
        return res.status(403).json({ error: 'AZP not allowed for this route' });
      }
    }
    if (policy.requiredRealmRoles?.length) {
      const ok = policy.requiredRealmRoles.every((r) => auth.roles.includes(r));
      if (!ok) return res.status(403).json({ error: 'Missing required realm role(s)' });
    }
    if (policy.requiredClientRoles) {
      for (const [clientId, roles] of Object.entries(policy.requiredClientRoles)) {
        const clientRoles = auth.clientRoles?.[clientId] ?? [];
        const ok = roles.every((r) => clientRoles.includes(r));
        if (!ok) return res.status(403).json({ error: `Missing client role(s) on ${clientId}` });
      }
    }
    if (policy.requireSucursalData) {
      if (!auth.sucursalId || !auth.codigoExt) {
        return res.status(403).json({ error: 'Missing sucursal codes' });
      }
    }
    next();
  };
}
