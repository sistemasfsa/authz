// src/admin/authz-kc.module.ts
import { DynamicModule, Module, Logger } from '@nestjs/common';
import KeycloakAdminClient from '@keycloak/keycloak-admin-client';

export interface KcAdminOptions {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  /** opt-in: crear manifest.json (deshabilitado por defecto; en libs NPM conviene dejarlo false) */
  snapshotToFile?: boolean;
  snapshotOutPath?: string;     // default process.cwd()/manifest.json
  snapshotPretty?: boolean;     // default true
}

export const KC_ADMIN = Symbol('KC_ADMIN');
export const KC_OPTS  = Symbol('KC_OPTS');

@Module({})
export class AuthzKcModule {
  private static readonly log = new Logger(AuthzKcModule.name);

  static forRoot(opts: KcAdminOptions): DynamicModule {
    return {
      module: AuthzKcModule,
      providers: [
        { provide: KC_OPTS, useValue: opts },
        {
          provide: KC_ADMIN,
          useFactory: async () => {
            const requestOptions: RequestInit | undefined =
              opts.timeoutMs
                ? { signal: timeoutSignal(opts.timeoutMs) }
                : undefined;

            const kc = new KeycloakAdminClient({
              baseUrl: opts.baseUrl,
              realmName: opts.realm,
              requestOptions,
            });

            await kc.auth({
              grantType: 'client_credentials',
              clientId: opts.clientId,
              clientSecret: opts.clientSecret,
            });

            // snapshot (opt-in; por defecto no se ejecuta en libs)
            if (opts.snapshotToFile) {
              await safeSnapshotToFile(kc, opts, this.log);
            }

            return kc;
          },
        },
      ],
      exports: [KC_ADMIN, KC_OPTS],
    };
  }

  static forRootAsync(input: {
    useFactory: (...args: any[]) => Promise<KcAdminOptions> | KcAdminOptions;
    inject?: any[];
  }): DynamicModule {
    return {
      module: AuthzKcModule,
      providers: [
        { provide: KC_OPTS, useFactory: input.useFactory, inject: input.inject ?? [] },
        {
          provide: KC_ADMIN,
          useFactory: async (opts: KcAdminOptions) => {
            const requestOptions: RequestInit | undefined =
              opts.timeoutMs
                ? { signal: timeoutSignal(opts.timeoutMs) }
                : undefined;

            const kc = new KeycloakAdminClient({
              baseUrl: opts.baseUrl,
              realmName: opts.realm,
              requestOptions,
            });

            await kc.auth({
              grantType: 'client_credentials',
              clientId: opts.clientId,
              clientSecret: opts.clientSecret,
            });

            if (opts.snapshotToFile) {
              await safeSnapshotToFile(kc, opts, new Logger(AuthzKcModule.name));
            }

            return kc;
          },
          inject: [KC_OPTS],
        },
      ],
      exports: [KC_ADMIN, KC_OPTS],
    };
  }
}

/** Helper: timeout compatible Node 16/18+ */
function timeoutSignal(ms?: number): AbortSignal | undefined {
  if (!ms) return undefined;
  // Node 18+
  const anyAbort = AbortSignal as any;
  if (typeof anyAbort?.timeout === 'function') return anyAbort.timeout(ms);
  // Polyfill
  const c = new AbortController();
  setTimeout(() => c.abort(new Error('Request timeout')), ms);
  return c.signal;
}

/** Helpers snapshot (opt-in; silencioso si falla, para no romper apps consumidoras) */
import { writeFileSync } from 'fs';
import { join } from 'path';
async function safeSnapshotToFile(kc: any, opts: KcAdminOptions, log: Logger) {
  try {
    const clientUuid = await getClientUuid(kc, opts.clientId);
    const [realmRoles, clientRoles] = await Promise.all([
      kc.roles.find(),
      kc.clients.listRoles({ id: clientUuid }),
    ]);

    const realmRolesWithComposites = await Promise.all(
      realmRoles.map(async (rr: any) => {
        const composites = await kc.roles.getCompositeRoles({ id: rr.id! });
        const clientComposites = (composites ?? []).filter(
          (r: any) => r.clientRole && r.containerId === clientUuid,
        );
        return { ...rr, clientComposites: clientComposites.map((r: any) => r.name) };
      }),
    );

    const manifest = {
      realm: opts.realm,
      clientId: opts.clientId,
      policy: 'additive',
      realmRoles: realmRolesWithComposites.map((rr: any) => ({
        name: rr.name!,
        composites: { clientRoles: rr.clientComposites ?? [] },
      })),
      clientRoles: clientRoles.map((cr: any) => ({
        name: cr.name!, description: cr.description,
      })),
    };

    const outPath = opts.snapshotOutPath ?? join(process.cwd(), 'manifest.json');
    const pretty = opts.snapshotPretty ?? true;
    writeFileSync(outPath, JSON.stringify(manifest, null, pretty ? 2 : 0));
    log.log(`Manifest generado en ${outPath}`);
  } catch (e) {
    log.warn(`No se pudo generar manifest.json (se ignora): ${String((e as any)?.message ?? e)}`);
  }
}

async function getClientUuid(kc: any, clientId: string): Promise<string> {
  const clients = await kc.clients.find({ clientId });
  if (!clients?.[0]?.id) throw new Error(`Client '${clientId}' no encontrado`);
  return clients[0].id!;
}
