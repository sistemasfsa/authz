// src/auth/admin-config.types.ts
import type { Manifest } from '../admin/manifest.types';
import type { KcAdminOptions } from '../admin/authz-kc.module';
import type { AuthzBootstrapOptions } from '../admin/tokens';

export type AdminInlineConfig = {
  kc: KcAdminOptions;
  /** manifest embebido (puede ser null para solo snapshot/log) */
  manifest?: Manifest | null;
  options?: AuthzBootstrapOptions;
};

export type AdminAsyncConfig = {
  kc: KcAdminOptions;
  useFactory: (...args: any[]) => Promise<Manifest | null> | Manifest | null;
  inject?: any[];
  options?: AuthzBootstrapOptions;
};

export type AdminConfig = { inline: AdminInlineConfig } | { async: AdminAsyncConfig };
