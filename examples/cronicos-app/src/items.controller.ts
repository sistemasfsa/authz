import { Controller, Get, Post } from '@nestjs/common';
import { Authz, Perms } from '@sistemas-fsa/authz/nest';

const FRONT_CLIENT = process.env.FRONT_CLIENT || 'frontend-client-id';

@Controller('items')
@Authz({
  allowedAzp: [FRONT_CLIENT],
  requiredClientRoles: { [FRONT_CLIENT]: ['reader', 'admin'] },
  requireSucursalData: false,
})
export class ItemsController {
  @Get()
  @Perms('items:read')
  list() {
    return { ok: true };
  }

  @Authz({
    allowedAzp: [FRONT_CLIENT],
    requiredClientRoles: { [FRONT_CLIENT]: ['admin'] },
    requireSucursalData: true,
  })
  @Post()
  create() {
    return { created: true };
  }
}
