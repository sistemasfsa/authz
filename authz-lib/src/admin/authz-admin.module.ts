// src/admin/authz-admin.module.ts
import { DynamicModule, Module, Provider } from "@nestjs/common";
import { AuthzKcModule, KcAdminOptions } from "./authz-kc.module";
import {
  AUTHZ_MANIFEST,
  AUTHZ_SYNC_OPTIONS,
  AuthzBootstrapOptions,
} from "./tokens";
import { Manifest } from "./manifest.types";
import { AuthzBootstrapSync } from "./authz-bootstrap-sync";
import { AuthzSyncService } from "./authz-kc.service";

type ForRootInput = {
  kc: KcAdminOptions;
  manifest?: Manifest | null;
  options?: AuthzBootstrapOptions;
};

type ForRootAsyncInput = {
  kc: KcAdminOptions;
  useFactory: (...args: any[]) => Promise<Manifest | null> | Manifest | null;
  inject?: any[];
  options?: AuthzBootstrapOptions;
};

@Module({})
export class AuthzAdminModule {
  static forRoot(input: ForRootInput): DynamicModule {
    const manifestProvider: Provider = {
      provide: AUTHZ_MANIFEST,
      useValue: input.manifest ?? null,
    };
    const optionsProvider: Provider = {
      provide: AUTHZ_SYNC_OPTIONS,
      useValue: input.options ?? {
        runOnBootstrap: false,
        createMissingClientRoles: true,
        dryRunInNonProd: true,
      },
    };
    return {
      module: AuthzAdminModule,
      imports: [AuthzKcModule.forRoot(input.kc)],
      providers: [
        manifestProvider,
        optionsProvider,
        AuthzSyncService,
        AuthzBootstrapSync,
      ],
      exports: [AuthzSyncService],
    };
  }

  static forRootAsync(input: ForRootAsyncInput): DynamicModule {
    const manifestProvider: Provider = {
      provide: AUTHZ_MANIFEST,
      useFactory: input.useFactory,
      inject: input.inject ?? [],
    };
    const optionsProvider: Provider = {
      provide: AUTHZ_SYNC_OPTIONS,
      useValue: input.options ?? {
        runOnBootstrap: false,
        createMissingClientRoles: true,
        dryRunInNonProd: true,
      },
    };
    return {
      module: AuthzAdminModule,
      imports: [AuthzKcModule.forRoot(input.kc)],
      providers: [
        manifestProvider,
        optionsProvider,
        AuthzSyncService,
        AuthzBootstrapSync,
      ],
      exports: [AuthzSyncService],
    };
  }
}
