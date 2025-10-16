// src/auth/auth.module.ts
import { DynamicModule, Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTH_OPTIONS } from "./tokens.js";
import type { AuthModuleOptions } from "../shared/contracts.js";
import { ApiJwtGuard } from "./guards/api-jwt.guard.js";

import { AuthzAdminModule } from "../admin/authz-admin.module.js";
import type { AdminConfig } from "../admin/admin-config.types.js";

@Module({})
export class AuthModule {
  static forRoot(opts: AuthModuleOptions, admin?: AdminConfig): DynamicModule {
    const base: DynamicModule = {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: opts },
        Reflector,
        ApiJwtGuard,
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
    const base: DynamicModule = {
      module: AuthModule,
      providers: [
        {
          provide: AUTH_OPTIONS,
          useFactory: factory.useFactory,
          inject: factory.inject ?? [],
        },
        Reflector,
        ApiJwtGuard,
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
