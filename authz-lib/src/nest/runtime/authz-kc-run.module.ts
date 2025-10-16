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
    const coreProvider = { provide: CORE_CONFIG, useValue: core };
    const runtimeProvider = { provide: RUNTIME_CONFIG, useValue: runtime };

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

    const downstreamProviders = (runtime.downstreams ?? []).map((d: DownstreamConfig) => ({
      provide: DownstreamToken(d.name),
      useFactory: (factory: DownstreamFactory) => factory.build(d),
      inject: [DownstreamFactory],
    }));

    return {
      module: AuthzKcRuntimeModule,
      global: true,
      providers: [
        coreProvider,
        runtimeProvider,
        kcProvider,
        exProvider,
        factoryProvider,
        ...downstreamProviders,
      ],
      exports: [
        ...downstreamProviders.map(p => p.provide),
        TokenExchangeService, // útil para jobs (client_credentials)
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
