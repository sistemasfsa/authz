// src/runtime/authz-kc.module.ts
import { DynamicModule, Global, MiddlewareConsumer, Module, NestModule, Provider } from '@nestjs/common';
import { AuthzCoreConfig, AuthzRuntimeConfig, DownstreamConfig } from './types';
import { KcHttp } from './kc-http';
import { TokenExchangeService } from './token-exchange.service';
import { DownstreamFactory } from './downstream.factory';
import { RequestContextMiddleware } from '../middlewares/request-context.middleware';
import { ASYNC_CFG, CORE_CONFIG, RUNTIME_CONFIG } from '../tokens';

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
    namesFactory: (...args: any[]) => Promise<string[]> | string[];
  }): DynamicModule {
    // 1) Resolver config async una sola vez
    const asyncConfigProvider: Provider = {
      provide: ASYNC_CFG,
      useFactory: input.useFactory,
      inject: input.inject ?? [],
    };

    // 2) Providers de config derivados del ASYNC_CFG (¡no volvemos a ejecutar useFactory!)
    const coreProvider: Provider = {
      provide: CORE_CONFIG,
      useFactory: (cfg: { core: AuthzCoreConfig }) => cfg.core,
      inject: [ASYNC_CFG],
    };

    const runtimeProvider: Provider = {
      provide: RUNTIME_CONFIG,
      useFactory: (cfg: { runtime: AuthzRuntimeConfig }) => cfg.runtime,
      inject: [ASYNC_CFG],
    };

    // 3) Infra base
    const kcProvider: Provider = {
      provide: KcHttp,
      useFactory: (cfg: AuthzCoreConfig) => new KcHttp(cfg),
      inject: [CORE_CONFIG],
    };

    const exProvider: Provider = {
      provide: TokenExchangeService,
      useFactory: (cfg: AuthzCoreConfig, kc: KcHttp) => new TokenExchangeService(cfg, kc),
      inject: [CORE_CONFIG, KcHttp],
    };

    const factoryProvider: Provider = {
      provide: DownstreamFactory,
      useFactory: (ex: TokenExchangeService) => new DownstreamFactory(ex),
      inject: [TokenExchangeService],
    };

    // 4) Declaración de tokens DOWNSTREAM_* en tiempo de construcción del módulo
    //    Tomamos los nombres desde namesFactory (se asume función pura o que no requiere DI directo aquí).
    //    Cada provider resuelve su config real leyendo RUNTIME_CONFIG en su propio useFactory.
    const declaredNames = (() => {
      // Si namesFactory necesita DI, el consumidor puede pasar una función pura que lea de env
      // o comparta helper con useFactory. Aquí la ejecutamos sin args por diseño.
      const res = input.namesFactory?.() ?? [];
      if (res instanceof Promise) {
        throw new Error('namesFactory no debe ser asíncrona a la hora de declarar providers. Devuelve string[] sincrónico.');
      }
      return res;
    })();

    const downstreamProviders: Provider[] = declaredNames.map((name) => ({
      provide: DownstreamToken(name),
      useFactory: (rt: AuthzRuntimeConfig, factory: DownstreamFactory) => {
        const def = (rt.downstreams ?? []).find((d: DownstreamConfig) => d.name === name);
        if (!def) {
          throw new Error(`Downstream "${name}" no está definido en runtime.downstreams`);
        }
        return factory.build(def);
      },
      inject: [RUNTIME_CONFIG, DownstreamFactory],
    }));

    // 5) Armamos el módulo final reutilizando _base (sin runtime directo)
    const base = this._base({
      coreProvider,
      runtimeProvider,
      runtime: undefined as any, // se inyecta en runtimeProvider
      extraProviders: [
        asyncConfigProvider,
        kcProvider,
        exProvider,
        factoryProvider,
        ...downstreamProviders,
      ],
      extraExports: [
        ...declaredNames.map((n) => DownstreamToken(n)),
        TokenExchangeService,
      ],
      extraImports: input.imports ?? [],
    });

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
