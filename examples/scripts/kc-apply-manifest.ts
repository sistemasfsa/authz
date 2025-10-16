/* eslint-disable no-console */
import "dotenv/config";
import KcAdminClient from "@keycloak/keycloak-admin-client";
import type ClientRepresentation from "@keycloak/keycloak-admin-client/lib/defs/clientRepresentation";

import fs from "node:fs/promises";
import path from "node:path";

type Manifest = {
  realm: string;
  clients: Array<{
    clientId: string;
    publicClient?: boolean;
    bearerOnly?: boolean;
    serviceAccountsEnabled?: boolean;
    directAccessGrantsEnabled?: boolean;
    standardFlowEnabled?: boolean;
    protocol?: string;
    clientAuthenticatorType?: string;
    secret?: string;
    attributes?: Record<string, any>;
    defaultRoles?: string[];
    clientRoles?: string[];
    protocolMappers?: any[];
  }>;
  tokenExchange?: Array<{
    fromClientId: string;
    toClientId: string;
    allowed: boolean;
  }>;
};

type FineGrainPerms = {
  scopePermissions?: Record<string, { id: string; name?: string }>;
  // ...otros campos que aporta KC
};

async function findClientId(
  kc: KcAdminClient,
  realm: string,
  clientId: string
) {
  const list = await kc.clients.find({ realm, clientId });
  return list?.[0];
}

async function upsertClient(
  kc: KcAdminClient,
  realm: string,
  c: Manifest["clients"][number]
) {
  const existing = await findClientId(kc, realm, c.clientId);
  const base: ClientRepresentation = {
    clientId: c.clientId,
    protocol: c.protocol ?? "openid-connect",
    publicClient: c.publicClient ?? false,
    bearerOnly: c.bearerOnly ?? false,
    serviceAccountsEnabled: c.serviceAccountsEnabled ?? false,
    directAccessGrantsEnabled: c.directAccessGrantsEnabled ?? false,
    standardFlowEnabled: c.standardFlowEnabled ?? false,
    attributes: c.attributes ?? {},
    clientAuthenticatorType: c.clientAuthenticatorType,
    secret: c.secret,
    protocolMappers: c.protocolMappers ?? [],
  };

  if (!existing) {
    console.log(`+ create client ${c.clientId}`);
    const created = await kc.clients.create({ realm, ...base });
    // En KC 26, create retorna { id } o vacío; re-lookup para asegurar.
    const createdObj = created?.id
      ? { id: created.id }
      : await findClientId(kc, realm, c.clientId);
    return createdObj?.id!;
  } else {
    console.log(`~ update client ${c.clientId}`);
    await kc.clients.update({ realm, id: existing.id! }, base);
    return existing.id!;
  }
}

async function syncClientRoles(
  kc: KcAdminClient,
  realm: string,
  clientId: string,
  roles: string[]
) {
  const client = await findClientId(kc, realm, clientId);
  if (!client?.id) throw new Error(`client not found ${clientId}`);

  const existing = await kc.clients.listRoles({ realm, id: client.id });
  const existingNames = new Set(existing.map((r) => r.name));
  for (const r of roles) {
    if (!existingNames.has(r)) {
      console.log(`  + role ${clientId}:${r}`);
      await kc.clients.createRole({ realm, id: client.id, name: r });
    }
  }
}

async function enableClientPermissions(
  kc: KcAdminClient,
  realm: string,
  clientId: string
) {
  const client = await findClientId(kc, realm, clientId);
  if (!client?.id) throw new Error(`client not found ${clientId}`);
  await kc.clients.updateFineGrainPermission(
    { realm, id: client.id },
    { enabled: true }
  );
}

/** Helpers para llamadas raw al Admin REST que el SDK no cubre bien */
function joinUrl(base: string, ...parts: string[]) {
  return [
    base.replace(/\/+$/, ""),
    ...parts.map((p) => p.replace(/^\/+/, "")),
  ].join("/");
}

async function adminGET<T>(
  kc: KcAdminClient,
  adminBase: string,
  urlPath: string
): Promise<T> {
  const token = await kc.getAccessToken();
  const res = await fetch(joinUrl(adminBase, urlPath), {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`GET ${urlPath} => ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function adminPOST<T>(
  kc: KcAdminClient,
  adminBase: string,
  urlPath: string,
  data: any
): Promise<T> {
  const token = await kc.getAccessToken();
  const res = await fetch(joinUrl(adminBase, urlPath), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(`POST ${urlPath} => ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({} as T));
}

async function adminPUT<T>(
  kc: KcAdminClient,
  adminBase: string,
  urlPath: string,
  data: any
): Promise<T> {
  const token = await kc.getAccessToken();
  const res = await fetch(joinUrl(adminBase, urlPath), {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(`PUT ${urlPath} => ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({} as T));
}

async function getTokenExchangePermissionId(
  kc: KcAdminClient,
  realm: string,
  clientId: string
): Promise<{ clientInternalId: string; permId: string }> {
  const client = await findClientId(kc, realm, clientId);
  if (!client?.id) throw new Error(`client not found ${clientId}`);

  const perms = (await kc.clients.listFineGrainPermissions({
    realm,
    id: client.id,
  })) as unknown as FineGrainPerms;

  const tokenEx = perms?.scopePermissions?.["token-exchange"];
  if (!tokenEx?.id) {
    throw new Error(
      `token-exchange permission not exposed for client ${clientId}`
    );
  }

  return { clientInternalId: client.id!, permId: tokenEx.id };
}

async function allowTokenExchange(
  kc: KcAdminClient,
  realm: string,
  fromClientId: string,
  toClientId: string,
  adminBase: string
) {
  const to = await findClientId(kc, realm, toClientId);
  const from = await findClientId(kc, realm, fromClientId);
  if (!to?.id || !from?.id) {
    throw new Error(
      `clients not found for exchange ${fromClientId} -> ${toClientId}`
    );
  }

  // 1) Encender management permissions (fine grained)
  await enableClientPermissions(kc, realm, toClientId);

  // 2) Obtener permId de "token-exchange" vía listFineGrainPermissions
  const { clientInternalId: toId, permId } = await getTokenExchangePermissionId(
    kc,
    realm,
    toClientId
  );

  // 3) Crear/asegurar policy tipo "client" que autoriza al fromClient
  const polName = `allow-${fromClientId}->${toClientId}-token-exchange`;

  // Buscar policy por nombre
  const polSearch: any[] = await adminGET(
    kc,
    adminBase,
    `/admin/realms/${realm}/clients/${toId}/authz/resource-server/policy?name=${encodeURIComponent(
      polName
    )}`
  );

  let policy = polSearch?.[0];
  if (!policy) {
    console.log(`  + policy ${polName}`);
    policy = await adminPOST(
      kc,
      adminBase,
      `/admin/realms/${realm}/clients/${toId}/authz/resource-server/policy/client`,
      {
        name: polName,
        clients: [from.id],
        logic: "POSITIVE",
        decisionStrategy: "UNANIMOUS",
      }
    );
  }

  // 4) Vincular policy a la permission "token-exchange" (scope permission)
  const permDetail: any = await adminGET(
    kc,
    adminBase,
    `/admin/realms/${realm}/clients/${toId}/authz/resource-server/permission/scope/${permId}`
  );

  const hasPol = (permDetail?.policies || []).some(
    (p: any) => p.name === polName
  );
  if (!hasPol) {
    console.log(`  ~ attach policy to token-exchange permission`);
    await adminPUT(
      kc,
      adminBase,
      `/admin/realms/${realm}/clients/${toId}/authz/resource-server/permission/scope/${permId}`,
      {
        ...permDetail,
        policies: [
          ...(permDetail?.policies || []),
          { id: policy.id, name: policy.name },
        ],
      }
    );
  }
}

async function main() {
  const adminUrl = (
    process.env.KEYCLOAK_BASE_URL || "http://localhost:8080"
  ).replace(/\/+$/, "");
  const username = process.env.KEYCLOAK_USER || "admin";
  const password = process.env.KEYCLOAK_PASSWORD || "admin";
  const manifestPath =
    process.env.MANIFEST_PATH || path.resolve(__dirname, "./kc-manifest.json");

  const raw = await fs.readFile(manifestPath, "utf-8");
  const manifest: Manifest = JSON.parse(raw);

  const kc = new KcAdminClient({ baseUrl: adminUrl, realmName: "master" });
  await kc.auth({
    grantType: "password",
    username,
    password,
    clientId: "admin-cli",
  });

  // Ensure realm
  const realms = await kc.realms.find();
  if (!realms.some((r) => r.realm === manifest.realm)) {
    console.log(`+ create realm ${manifest.realm}`);
    await kc.realms.create({ realm: manifest.realm, enabled: true });
  } else {
    console.log(`~ realm ${manifest.realm} exists`);
  }
  kc.setConfig({ realmName: manifest.realm });

  // Clients + roles
  for (const c of manifest.clients) {
    await upsertClient(kc, manifest.realm, c);
    if (c.clientRoles?.length) {
      await syncClientRoles(kc, manifest.realm, c.clientId, c.clientRoles);
    }
  }

  // Token Exchange permissions
  for (const rule of manifest.tokenExchange ?? []) {
    if (!rule.allowed) continue;
    console.log(`~ token-exchange: ${rule.fromClientId} -> ${rule.toClientId}`);
    await allowTokenExchange(
      kc,
      manifest.realm,
      rule.fromClientId,
      rule.toClientId,
      adminUrl
    );
  }

  console.log("✓ manifest applied");
}

main().catch((e) => {
  console.error("manifest failed", e);
  process.exit(1);
});
