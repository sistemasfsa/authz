// src/auth/decorators/client-perms.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const CLIENT_PERMS_KEY = 'authz_client_perms';

/**
 * Declara permisos (clientRoles) sobre el clientId = audience actual.
 * Se puede usar a nivel clase o método. Si hay en ambos, se fusionan.
 */
export const ClientPerms = (...perms: string[]) =>
  SetMetadata(CLIENT_PERMS_KEY, perms);
