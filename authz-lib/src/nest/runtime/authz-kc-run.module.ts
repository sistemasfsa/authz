// src/runtime/authz-kc.module.ts
import { DynamicModule, Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthzCoreConfig, AuthzRuntimeConfig, DownstreamConfig } from './types';
import { KcHttp } from './kc-http';
import { TokenExchangeService } from './token-exchange.service';
import { DownstreamFactory } from './downstream.factory';
import { RequestContextMiddleware } from '../middlewares/request-context.middleware';
import { CORE_CONFIG, RUNTIME_CONFIG } from '../tokens';

export const DownstreamToken = (name: string) => `DOWNSTREAM_${name.toUpperCase()}`;

@Global()
@Module({})
export class AuthzKcRuntimeModule implements NestModule {
  static forRoot(core: AuthzCoreConfig, runtime: AuthzRuntimeConfig): DynamicModule {
    return this._base({
      coreProvider: { provide: CORE_CONFIG, useValue: core },
      runtimeProvider: { provide: RUNTIME_CONFIG, useValue: runtime },
      runtime,
    });
  }

  // 👇 Nuevo: configuración asíncrona
  static forRootAsync(input: {
    useFactory: (...args: any[]) => Promise<{ core: AuthzCoreConfig; runtime: AuthzRuntimeConfig }> | { core: AuthzCoreConfig; runtime: AuthzRuntimeConfig };
    inject?: any[];
    imports?: any[]; // p.ej. ConfigModule
  }): DynamicModule {
    const runtimeHolder = { current: undefined as undefined | AuthzRuntimeConfig };

    const coreProvider = {
      provide: CORE_CONFIG,
      useFactory: async (...args: any[]) => {
        const res = await input.useFactory(...args);
        runtimeHolder.current = res.runtime;
        return res.core;
      },
      inject: input.inject ?? [],
    };

    const runtimeProvider = {
      provide: RUNTIME_CONFIG,
      useFactory: async (...args: any[]) => {
        const res = await input.useFactory(...args);
        runtimeHolder.current = res.runtime;
        return res.runtime;
      },
      inject: input.inject ?? [],
    };

    // ⚠️ Los downstream providers dependen del runtime ya resuelto.
    // Creamos un factory que se arma en tiempo de módulo.
    const dynamicDownstreamsFactory = {
      provide: 'RUNTIME_DOWNSTREAM_PROVIDERS',
      useFactory: (factory: DownstreamFactory) => {
        const rt = runtimeHolder.current!;
        return (rt.downstreams ?? []).map((d: DownstreamConfig) => ({
          provide: DownstreamToken(d.name),
          useFactory: (f: DownstreamFactory) => f.build(d),
          inject: [DownstreamFactory],
        }));
      },
      inject: [DownstreamFactory],
    };

    const base = this._base({
      coreProvider,
      runtimeProvider,
      runtime: undefined as any, // se inyecta en runtimeProvider
      extraProviders: [dynamicDownstreamsFactory],
      extraExports: [], // exportamos abajo los tokens generados
      extraImports: input.imports ?? [],
    });

    // Inyectamos los downstream providers generados
    base.providers!.push({
      provide: 'DOWNSTREAMS_REGISTER',
      useFactory: (moduleRef: any, defs: any[]) => {
        // Nest registrará estos providers al construir el módulo (no necesitas nada acá)
        return true;
      },
      inject: ['RUNTIME_DOWNSTREAM_PROVIDERS'],
    });

    // Exportar dinámicamente los tokens DOWNSTREAM_*
    base.exports!.push('RUNTIME_DOWNSTREAM_PROVIDERS');

    return base;
  }

  private static _base(args: {
    coreProvider: any;
    runtimeProvider: any;
    runtime: AuthzRuntimeConfig;
    extraProviders?: any[];
    extraExports?: any[];
    extraImports?: any[];
  }): DynamicModule {
    const kcProvider = {
      provide: KcHttp,
      useFactory: (cfg: AuthzCoreConfig) => new KcHttp(cfg),
      inject: [CORE_CONFIG],
    };

    const exProvider = {
      provide: TokenExchangeService,
      useFactory: (cfg: AuthzCoreConfig, kc: KcHttp) => new TokenExchangeService(cfg, kc),
      inject: [CORE_CONFIG, KcHttp],
    };

    const factoryProvider = {
      provide: DownstreamFactory,
      useFactory: (ex: TokenExchangeService) => new DownstreamFactory(ex),
      inject: [TokenExchangeService],
    };

    // Si vino runtime directo (forRoot), armamos aquí los providers de downstream.
    const downstreamProviders =
      args.runtime?.downstreams?.map((d: DownstreamConfig) => ({
        provide: DownstreamToken(d.name),
        useFactory: (factory: DownstreamFactory) => factory.build(d),
        inject: [DownstreamFactory],
      })) ?? [];

    return {
      module: AuthzKcRuntimeModule,
      global: true,
      imports: args.extraImports ?? [],
      providers: [
        args.coreProvider,
        args.runtimeProvider,
        kcProvider,
        exProvider,
        factoryProvider,
        ...downstreamProviders,
        ...(args.extraProviders ?? []),
      ],
      exports: [
        // exportar cada downstream
        ...downstreamProviders.map((p) => p.provide),
        TokenExchangeService, // útil para jobs (client_credentials)
        ...(args.extraExports ?? []),
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
