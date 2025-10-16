// authz-sync.service.ts
import { Inject, Injectable } from "@nestjs/common";
import type KcAdminClient from "@keycloak/keycloak-admin-client";
import { KC_ADMIN, KC_OPTS, KcAdminOptions } from "./authz-kc.module";
import { Manifest } from "./manifest.types";

@Injectable()
export class AuthzSyncService {
  constructor(
    @Inject(KC_ADMIN) private readonly kc: KcAdminClient,
    @Inject(KC_OPTS) private readonly opts: KcAdminOptions
  ) {}

  private async getClientId(): Promise<string> {
    const clients = await this.kc.clients.find({
      clientId: this.opts.clientId,
    });
    if (!clients?.[0]?.id)
      throw new Error(`Client '${this.opts.clientId}' no encontrado`);
    return clients[0].id!;
  }

  /** Crea client roles que falten y devuelve todos por nombre */
  private async ensureClientRoles(
    clientUuid: string,
    want: Array<{ name: string; description?: string }>
  ): Promise<Map<string, any>> {
    const existing = await this.kc.clients.listRoles({ id: clientUuid });
    const byName = new Map(existing.map((r) => [r.name!, r]));

    for (const r of want ?? []) {
      if (!byName.has(r.name)) {
        await this.kc.clients.createRole({
          id: clientUuid,
          name: r.name,
          description: r.description,
        });
      }
    }

    // refresco listado y devuelvo el mapa actualizado
    const after = await this.kc.clients.listRoles({ id: clientUuid });
    return new Map(after.map((r) => [r.name!, r]));
  }

  async snapshot() {
    const clientUuid = await this.getClientId();
    const [realmRoles, clientRoles] = await Promise.all([
      this.kc.roles.find(),
      this.kc.clients.listRoles({ id: clientUuid }),
    ]);
    const realmRoleByName = new Map(realmRoles.map((r) => [r.name!, r]));

    const realmRolesWithComposites = await Promise.all(
      realmRoles.map(async (rr) => {
        const composites = await this.kc.roles.getCompositeRoles({
          id: rr.id!,
        });
        const clientComposites = (composites ?? []).filter(
          (r: any) => r.clientRole && r.containerId === clientUuid
        );
        return {
          ...rr,
          clientComposites: clientComposites.map((r: any) => r.name),
        };
      })
    );

    return {
      realm: this.opts.realm,
      clientId: this.opts.clientId,
      realmRoles: realmRolesWithComposites,
      clientRoles,
    };
  }

  async createManifest(): Promise<Manifest> {
    const snap = await this.snapshot();
    return {
      realm: snap.realm,
      clientId: snap.clientId,
      policy: "additive",
      realmRoles: snap.realmRoles.map((rr) => ({
        name: rr.name!,
        composites: { clientRoles: rr.clientComposites ?? [] },
      })),
      clientRoles: snap.clientRoles.map((cr) => ({
        name: cr.name!,
        description: cr.description,
      })),
    };
  }

  /**
   * Sincroniza en modo aditivo.
   * - Si `createMissingClientRoles` está activo, crea los client roles del manifest que no existan.
   * - Asigna composites faltantes a cada realm role.
   * - No crea realm roles (asumís que ya existen).
   */
  async sync(
    manifest: Manifest,
    opts?: { dryRun?: boolean; createMissingClientRoles?: boolean }
  ) {
    if (manifest.policy !== "additive")
      throw new Error(`Solo se admite policy 'additive'`);
    if (
      manifest.realm !== this.opts.realm ||
      manifest.clientId !== this.opts.clientId
    ) {
      throw new Error(`Manifest apunta a otro realm/clientId`);
    }

    const clientUuid = await this.getClientId();

    // 1) Asegurar client roles (opcional)
    let clientRoleByName: Map<string, any>;
    if (opts?.createMissingClientRoles && manifest.clientRoles?.length) {
      clientRoleByName = await this.ensureClientRoles(
        clientUuid,
        manifest.clientRoles
      );
    } else {
      const clientRoles = await this.kc.clients.listRoles({ id: clientUuid });
      clientRoleByName = new Map(clientRoles.map((r) => [r.name!, r]));
    }

    const realmRoles = await this.kc.roles.find();
    const realmRoleByName = new Map(realmRoles.map((r) => [r.name!, r]));

    // 2) Validaciones básicas
    for (const rr of manifest.realmRoles) {
      if (!realmRoleByName.has(rr.name)) {
        throw new Error(`Realm role inexistente en KC: ${rr.name}`);
      }
      for (const crName of rr.composites?.clientRoles ?? []) {
        if (!clientRoleByName.has(crName)) {
          throw new Error(
            `Client role inexistente en KC: ${crName}. ` +
              `Activa createMissingClientRoles o definilo en Keycloak`
          );
        }
      }
    }

    // 3) Plan: qué composites faltan por cada realm role
    const plan: Array<{ realmRole: string; addClientRoles: string[] }> = [];

    for (const rr of manifest.realmRoles) {
      const targetClientRoles = new Set(rr.composites?.clientRoles ?? []);
      if (!targetClientRoles.size) continue;

      const rrRep = realmRoleByName.get(rr.name)!;
      const currentComposites = await this.kc.roles.getCompositeRoles({
        id: rrRep.id!,
      });

      const currentClientCompositeNames = new Set(
        (currentComposites ?? [])
          .filter((r: any) => r.clientRole && r.containerId === clientUuid)
          .map((r: any) => r.name as string)
      );

      const missing = [...targetClientRoles].filter(
        (cr) => !currentClientCompositeNames.has(cr)
      );
      if (missing.length)
        plan.push({ realmRole: rr.name, addClientRoles: missing });
    }

    if (opts?.dryRun) return { dryRun: true, plan };

    // 4) Aplicar plan
    for (const step of plan) {
      const rrRep = realmRoleByName.get(step.realmRole)!;
      const rolesToAdd = step.addClientRoles.map(
        (name) => clientRoleByName.get(name)!
      );
      await this.kc.roles.createComposite(
        { roleId: rrRep.id! }, // acá sí es roleId
        rolesToAdd.map((r) => ({
          id: r.id,
          name: r.name,
          clientRole: true,
          containerId: clientUuid,
        }))
      );
    }

    return { applied: plan.length, plan };
  }
}
