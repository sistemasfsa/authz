import { Controller, Get, Param } from '@nestjs/common';
import { Authz } from '@sistemas-fsa/authz/nest';
import { InjectDownstreamHttp } from '@sistemas-fsa/authz/nest';
import type { DownstreamHttp } from '@sistemas-fsa/authz/nest';

const FRONT_CLIENT = process.env.FRONT_CLIENT || 'frontend-client-id';

@Controller('bridge')
@Authz({
  allowedAzp: [FRONT_CLIENT],
  requiredClientRoles: { [FRONT_CLIENT]: ['reader'] }, // operador con 'reader' alcanza
  requireSucursalData: false,
})
export class BridgeController {
  constructor(
    // 👉 Axios instance con exchange automático hacia “clientes”
    @InjectDownstreamHttp('clientes')
    private readonly clientesApi: DownstreamHttp.Instance,
  ) {}

  @Get('clientes/by-dni/:dni')
  async proxy(@Param('dni') dni: string) {
    const { data } = await this.clientesApi.get(`/clientes/by-dni/${dni}`);
    // devolvemos la respuesta de clientes + un tag para ver el “hop”
    return { via: 'cronicos', data };
  }
}
