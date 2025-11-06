// src/auth/auth.module.ts
import { DynamicModule, Module, Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AUTH_OPTIONS } from "./tokens.js";
import type { AuthModuleOptions } from "../shared/contracts.js";
import { ApiJwtGuard } from "./guards/api-jwt.guard.js";
import { AuthzAdminModule } from "../admin/authz-admin.module.js";
import type { AdminConfig } from "../admin/admin-config.types.js";

@Module({})
export class AuthModule {
  static forRoot(opts: AuthModuleOptions, admin?: AdminConfig): DynamicModule {
    const apiJwtGlobal: Provider = {
      provide: APP_GUARD,
      useClass: ApiJwtGuard,
    };

    const base: DynamicModule = {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: opts },
        ApiJwtGuard,
        apiJwtGlobal, // ✅ ahora sí global
      ],
      exports: [ApiJwtGuard, AUTH_OPTIONS],
    };

    if (!admin) return base;

    const imports =
      "inline" in admin
        ? [
            AuthzAdminModule.forRoot({
              kc: admin.inline.kc,
              manifest: admin.inline.manifest ?? null,
              options: admin.inline.options,
            }),
          ]
        : [
            AuthzAdminModule.forRootAsync({
              kc: admin.async.kc,
              useFactory: admin.async.useFactory,
              inject: admin.async.inject ?? [],
              options: admin.async.options,
            }),
          ];

    return { ...base, imports };
  }

  static forRootAsync(
    factory: {
      useFactory: (
        ...args: any[]
      ) => Promise<AuthModuleOptions> | AuthModuleOptions;
      inject?: any[];
    },
    admin?: AdminConfig
  ): DynamicModule {
    const apiJwtGlobal: Provider = {
      provide: APP_GUARD,
      useClass: ApiJwtGuard,
    };

    const base: DynamicModule = {
      module: AuthModule,
      providers: [
        {
          provide: AUTH_OPTIONS,
          useFactory: factory.useFactory,
          inject: factory.inject ?? [],
        },
        ApiJwtGuard,
        apiJwtGlobal, // ✅ global en la variante async también
      ],
      exports: [ApiJwtGuard, AUTH_OPTIONS],
    };

    if (!admin) return base;

    const imports =
      "inline" in admin
        ? [
            AuthzAdminModule.forRoot({
              kc: admin.inline.kc,
              manifest: admin.inline.manifest ?? null,
              options: admin.inline.options,
            }),
          ]
        : [
            AuthzAdminModule.forRootAsync({
              kc: admin.async.kc,
              useFactory: admin.async.useFactory,
              inject: admin.async.inject ?? [],
              options: admin.async.options,
            }),
          ];

    return { ...base, imports };
  }
}
