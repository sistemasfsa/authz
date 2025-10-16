export type Manifest = {
  realm: string;
  clientId: string;
  policy: 'additive';
  realmRoles: Array<{
    name: string;
    composites?: { clientRoles?: string[] };
  }>;
  clientRoles?: Array<{ name: string; description?: string }>;
};

// Un helper para construir el manifest a partir de tus definiciones internas
export type ApiAuthzDefinition = {
  /** Todos los permisos (client roles) que tu API expone */
  clientRoles: Array<{ name: string; description?: string }>;
  /** Asignaciones: realmRole -> lista de clientRoles */
  grantsByRealmRole: Record<string, string[]>;
};

export function buildManifestFromDefinition(
  realm: string,
  clientId: string,
  def: ApiAuthzDefinition,
): Manifest {
  return {
    realm,
    clientId,
    policy: 'additive',
    clientRoles: def.clientRoles,
    realmRoles: Object.keys(def.grantsByRealmRole).map((rr) => ({
      name: rr,
      composites: { clientRoles: def.grantsByRealmRole[rr] ?? [] },
    })),
  };
}