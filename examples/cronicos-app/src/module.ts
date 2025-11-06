import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule, ApiJwtGuard } from "@sistemas-fsa/authz/nest";

// 👉 Runtime (token-exchange + downstream)
import { AuthzKcRuntimeModule } from "@sistemas-fsa/authz/nest";
import { ItemsController } from "./items.controller.ts";
import { BridgeController } from "./bridge.controller.ts";

// Helpers existentes en tu test repo:
const parseCsv = (v?: string) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function parseIssuer(issuer: string) {
  const m = issuer.match(/^(.*)\/realms\/([^/]+)\/?$/);
  if (!m) throw new Error(`ISSUER inválido: ${issuer}`);
  return { baseUrl: m[1], realm: m[2] };
}

const ISSUER = process.env.ISSUER || "http://localhost:4444/realms/test";
const { baseUrl } = parseIssuer(ISSUER);
const FRONT_CLIENT = process.env.FRONT_CLIENT || "frontend-client-id";

@Module({
  imports: [
    AuthModule.forRoot({
      issuer: ISSUER,
      audience: process.env.CLIENT_ID || "cronicos-backend",
      allowedAzpDefault: parseCsv(process.env.ALLOWED_AZP).length
        ? parseCsv(process.env.ALLOWED_AZP)
        : [FRONT_CLIENT],
      requireSucursalDataDefault: false,
      claimNames: { sucursalId: "sucursalId", codigoExt: "codigoExt" },
      clockTolerance: 10,
    }),

    AuthzKcRuntimeModule.forRoot(
      {
        realmUrl: ISSUER,
        clientId: process.env.CLIENT_ID || "cronicos-backend",
        clientSecret: process.env.CLIENT_SECRET || "cronicos-secret",
        clockSkewSeconds: 30,
      },
      {
        downstreams: [
          {
            name: "clientes",
            baseURL: `http://localhost:${process.env.CLIENTES_PORT || 3005}`,
            audience: process.env.CLIENTES_AUDIENCE || "clientes-backend",
            timeoutMs: 5000,
            retry: { attempts: 2, backoffMs: 250 },
            fallbackClientCredentials: false,
            defaultHeaders: { "x-service": "cronicos" },
          },
        ],
      }
    ),
  ],
  controllers: [ItemsController, BridgeController],
  providers: [
    // ⬇️ Igual que tu example: eliges explícitamente el APP_GUARD
    {
      provide: APP_GUARD,
      useFactory: (g: ApiJwtGuard) => g,
      inject: [ApiJwtGuard],
    },
  ],
})
export class AppModule {}
