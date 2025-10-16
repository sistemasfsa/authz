// src/admin/tokens.ts
export const AUTHZ_MANIFEST = Symbol('AUTHZ_MANIFEST');
export const AUTHZ_SYNC_OPTIONS = Symbol('AUTHZ_SYNC_OPTIONS');

export type AuthzBootstrapOptions = {
  /** Ejecutar sync en bootstrap (default: true) */
  runOnBootstrap?: boolean;
  /** Crear clientRoles faltantes (default: true) */
  createMissingClientRoles?: boolean;
  /** Si true hace dryRun cuando NODE_ENV!=='production' */
  dryRunInNonProd?: boolean;
};
