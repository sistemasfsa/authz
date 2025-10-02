import { DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS } from './tokens.js';
import type { AuthModuleOptions } from '../shared/contracts.js';
import { ApiJwtGuard } from './guards/api-jwt.guard.js';

@Module({})
export class AuthModule {
  static forRoot(opts: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: opts },
        Reflector,
        ApiJwtGuard,
      ],
      exports: [ApiJwtGuard, AUTH_OPTIONS],
    };
  }

  static forRootAsync(factory: {
    useFactory: (...args: any[]) => Promise<AuthModuleOptions> | AuthModuleOptions;
    inject?: any[];
  }): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useFactory: factory.useFactory, inject: factory.inject ?? [] },
        Reflector,
        ApiJwtGuard,
      ],
      exports: [ApiJwtGuard, AUTH_OPTIONS],
    };
  }
}
