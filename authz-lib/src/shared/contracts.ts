export type AuthModuleOptions = {
  issuer: string; // e.g. https://kc.example.com/realms/<realm>
  audience: string; // e.g. "your-api-audience"
  allowedAzpDefault?: string[]; // default allowed clients (optional)
  requireSucursalDataDefault?: boolean; // default require branch codes (optional)
  claimNames?: { sucursalId: string; codigoExt: string }; // override claim names
  clockTolerance?: number; // seconds (default 10)
};

export type AuthzPolicy = {
  allowedAzp?: string[];
  requiredRealmRoles?: string[];
  requiredClientRoles?: Record<string, string[]>;
  requireSucursalData?: boolean;
};

export type AuthContext = {
  sub: string;
  roles: string[]; // realm roles
  azp: string; // token issuer clientId
  sucursalId?: string;
  codigoExt?: string;
  clientRoles?: Record<string, string[]>; // resource_access
};
