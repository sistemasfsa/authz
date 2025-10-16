// src/admin/authz-bootstrap-sync.ts
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AUTHZ_MANIFEST, AUTHZ_SYNC_OPTIONS, AuthzBootstrapOptions } from './tokens';
import { Manifest } from './manifest.types';
import { AuthzSyncService } from './authz-kc.service'; 

@Injectable()
export class AuthzBootstrapSync implements OnApplicationBootstrap {
  private readonly log = new Logger(AuthzBootstrapSync.name);

  constructor(
    private readonly syncService: AuthzSyncService,
    @Inject(AUTHZ_MANIFEST) private readonly manifest: Manifest | null,
    @Inject(AUTHZ_SYNC_OPTIONS) private readonly opts: AuthzBootstrapOptions,
  ) {}

  async onApplicationBootstrap() {
    if (!this.opts?.runOnBootstrap) {
      this.log.log('runOnBootstrap=false → no se ejecuta sync en bootstrap');
      return;
    }
    if (!this.manifest) {
      this.log.warn('No se recibió manifest → se salta sync');
      return;
    }

    const nonProd = process.env.NODE_ENV !== 'production';
    const dryRun = !!(this.opts?.dryRunInNonProd && nonProd);
    const createMissing = this.opts?.createMissingClientRoles ?? true;

    try {
      this.log.log(
        `Iniciando Authz sync (dryRun=${dryRun}, createMissingClientRoles=${createMissing})...`,
      );
      const res = await this.syncService.sync(this.manifest, {
        dryRun,
        createMissingClientRoles: createMissing,
      });
      if ('dryRun' in res && res.dryRun) {
        this.log.warn(`Authz dryRun: plan=${JSON.stringify(res.plan)}`);
      } else {
        this.log.log(`Authz applied=${res.applied} plan=${JSON.stringify(res.plan)}`);
      }
    } catch (err: any) {
      // según tu preferencia: o tirás error para impedir levantar, o logueás y seguís
      this.log.error(`Authz sync failed: ${err?.message ?? err}`);
      throw err; // si querés bloquear el arranque al fallar la sync
    }
  }
}
