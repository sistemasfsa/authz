# @sistemas-fsa/authz

**AuthN/Z toolkit for NestJS & Express (Keycloak + JOSE)**

Estándar interno de autenticación y autorización para servicios Node.js.

* Verifica JWT emitidos por Keycloak con [`jose`](https://github.com/panva/jose)
* Política de autorización declarativa por ruta
* Compatible con **NestJS** (guard + decorator) y **Express** (middlewares)
* Soporta **realm roles** y **client roles** (resource\_access)
* Validación de **audience** (aud) y **authorized party** (**azp**)
* Soporte para **claims de negocio** (ej.: `sucursalId`, `codigoExt`)

> Esta librería **no** acopla IDs de cliente o roles específicos de un proyecto. Se parametriza todo por opciones/env.

---

## Instalación

> Requiere Node.js 18+

```bash
npm i @sistemas-fsa/authz
```

La librería trae `jose` como dependencia. Estos paquetes se esperan como *peer* (en tus apps):

* **NestJS**: `@nestjs/common`, `@nestjs/core` (si usás Nest)
* **Express**: `express` (si usás Express)
* **TypeScript** proyectos: `reflect-metadata` (Nest) y `@types/express` (Express)

---

## Exports

* `@sistemas-fsa/authz` → entry común (tipos)
* `@sistemas-fsa/authz/nest` → **NestJS**

  * `AuthModule`, `ApiJwtGuard`, `Authz` (decorator)
* `@sistemas-fsa/authz/express` → **Express**

  * `authJwt` (middleware de verificación JWT)
  * `authorize` (middleware de autorización por ruta)

---

## Configuración de Keycloak (resumen)

1. **Issuer / Realm**

   * La librería descargará las **JWKS** de: `https://<KC>/realms/<REALM>/protocol/openid-connect/certs`
   * Configurá `issuer` con `https://<KC>/realms/<REALM>`
2. **API Audience (aud)**

   * Creá un **Client** (Confidential/Public) que represente a tu **API**.
   * Agregá un **Audience Mapper** para inyectar el ID de ese client en `aud` de los tokens.
3. **Authorized Party (azp)**

   * Los **clients emisores** (frontends, integraciones) aparecerán en el claim `azp`.
   * En la política de ruta podés exigir `allowedAzp: ["<client-frontend>", "<client-integration>"]`.
4. **Roles**

   * Realm roles: en `realm_access.roles`
   * Client roles: en `resource_access[<clientId>].roles`
5. **Claims de negocio** (opcional)

   * Si tu API los requiere, mapeá claims personalizados (ej.: `sucursalId`, `codigoExt`).

> El token debe incluir: `iss`, `aud` (contenga tu audience), `azp` permitido y, si tu política lo exige, `sucursalId`/`codigoExt`.

---

## Uso en NestJS

### 1) Módulo

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule, ApiJwtGuard } from '@sistemas-fsa/authz/nest';

@Module({
  imports: [
    AuthModule.forRoot({
      issuer: process.env.ISSUER!,                 // p.ej. https://kc/realms/mi-realm
      audience: process.env.AUDIENCE!,             // p.ej. mi-api
      allowedAzpDefault: (process.env.ALLOWED_AZP ?? '')
        .split(',').map(s => s.trim()).filter(Boolean),
      requireSucursalDataDefault: false,           // default global
      claimNames: { sucursalId: 'sucursalId', codigoExt: 'codigoExt' },
      clockTolerance: 10,
    }),
  ],
  providers: [
    { provide: APP_GUARD, useExisting: ApiJwtGuard },
    ApiJwtGuard,
  ],
})
export class AppModule {}
```

### 2) Proteger rutas con `@Authz`

```ts
import { Controller, Get, Post } from '@nestjs/common';
import { Authz } from '@sistemas-fsa/authz/nest';

const FRONT = process.env.FRONT_CLIENT || 'frontend-client-id';

@Controller('items')
@Authz({
  allowedAzp: [FRONT],
  requiredClientRoles: { [FRONT]: ['reader', 'admin'] },
  requireSucursalData: false,
})
export class ItemsController {
  @Get()
  list() { return { ok: true }; }

  @Authz({
    allowedAzp: [FRONT],
    requiredClientRoles: { [FRONT]: ['admin'] },
    requireSucursalData: true,
  })
  @Post()
  create() { return { created: true }; }
}
```

> **Tip TS:** si tu proyecto no usa metadata de decoradores, no la necesitas. Esta lib funciona sin `emitDecoratorMetadata` (recomendado). Usa `@Inject(...)` explícito internamente.

---

## Uso en Express

### 1) Middleware global JWT + autorización por ruta

```ts
import express from 'express';
import { authJwt, authorize } from '@sistemas-fsa/authz/express';

const ISSUER = process.env.ISSUER!;      // https://kc/realms/mi-realm
const AUD = process.env.AUDIENCE!;       // mi-api
const FRONT = process.env.FRONT_CLIENT!; // clientId emisor

const app = express();

app.use(authJwt({
  issuer: ISSUER,
  audience: AUD,
  requireSucursalDataDefault: false,
  claimNames: { sucursalId: 'sucursalId', codigoExt: 'codigoExt' },
  clockTolerance: 10,
}));

app.get(
  '/items',
  authorize({
    allowedAzp: [FRONT],
    requiredClientRoles: { [FRONT]: ['reader', 'admin'] },
  }),
  (req, res) => res.json({ ok: true, user: req.auth })
);

app.post(
  '/items',
  authorize({
    allowedAzp: [FRONT],
    requiredClientRoles: { [FRONT]: ['admin'] },
    requireSucursalData: true,
  }),
  (req, res) => res.status(201).json({ created: true })
);

app.listen(3000);
```

### Tipos (`req.auth`)

La librería **amplía** `Express.Request` para exponer `req.auth` y `req.tokenPayload`. No necesitas configuración extra: al importar desde `@sistemas-fsa/authz/express` los tipos se cargan.

---

## Variables de entorno de ejemplo

`.env` (Nest o Express)

```env
ISSUER=https://kc.miempresa.com/realms/mi-realm
AUDIENCE=mi-api
ALLOWED_AZP=frontend-client-id,integration-client-id
FRONT_CLIENT=frontend-client-id
```

---

## API de Opciones

```ts
export type AuthModuleOptions = {
  issuer: string;          // https://<kc>/realms/<realm>
  audience: string;        // clientId (API) esperado en `aud`
  allowedAzpDefault?: string[];
  requireSucursalDataDefault?: boolean;
  claimNames?: { sucursalId?: string; codigoExt?: string };
  clockTolerance?: number; // segundos de tolerancia de reloj
};

export type AuthzPolicy = {
  allowedAzp?: string[];
  requiredRealmRoles?: string[];
  requiredClientRoles?: Record<string, string[]>; // clientId -> roles requeridos
  requireSucursalData?: boolean;                   // exige claims sucursal/codigoExt
};
```

### Enriquecimiento de `req.auth`

```ts
export type AuthContext = {
  sub: string;
  roles: string[]; // realm roles
  azp: string;
  sucursalId?: string;
  codigoExt?: string;
  clientRoles: Record<string, string[]>; // por clientId
};
```

---

## Códigos de error (HTTP)

* **401 Unauthorized**

  * Falta `Authorization: Bearer ...`
  * Firma/issuer inválido
* **403 Forbidden**

  * `aud` no contiene la audience configurada
  * `azp` no permitido por la ruta
  * Faltan roles requeridos (realm o client)
  * `requireSucursalData` activo y faltan claims

---

## Troubleshooting

* **Imports con extensión `.js`**: si usás `moduleResolution: NodeNext`, TS exige import specifiers con `.js`. La lib está preparada para `Bundler` (recomendado) y no requiere extensiones.
* **Decorators metadata**: verás un warning de `@swc/core` si activás `emitDecoratorMetadata` al compilar con `tsup`. Puedes desactivarlo; la lib no lo necesita.
* **Monorepo workspaces**: si usás `workspace:*`, asegurate que tu `root/package.json` tenga `"private": true` y `"workspaces": [...]`, y que ningún `.npmrc` tenga `workspaces = false/null`.

---

## Ejemplos locales

En este repo se incluyen ejemplos en `examples/`:

* `mock-issuer/` → Issuer OIDC de prueba (JWKS + emisión de tokens firmados)
* `express-app/` → mini API Express usando la librería
* `nest-app/` → mini API NestJS usando la librería

### Scripts sugeridos (root)

```bash
npm run build         # compila la lib
npm run start:issuer  # levanta mock issuer en 4444
npm run start:express # Express en 3001
npm run start:nest    # Nest en 3002
```

---

## Versionado y soporte

* SemVer: `fix` → patch, `feat` → minor, `breaking` → major
* PRs con tests/manual steps de verificación son bienvenidos

---

## Licencia

MIT — ver [LICENSE](./LICENSE)
