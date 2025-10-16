import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AudienceGuardFactory } from '@sistemas-fsa/authz/nest';

const AUD = process.env.CLIENTES_AUDIENCE || 'clientes-backend';

@Controller('clientes')
export class ClientesController {
  // Exige que el JWT entrante tenga aud = clientes-backend (y opcionalmente roles)
  @UseGuards(AudienceGuardFactory(AUD /*, ['reader']*/))
  @Get('by-dni/:dni')
  getByDni(@Param('dni') dni: string) {
    return {
      ok: true,
      source: 'clientes',
      dni,
      nombre: 'Juan Pérez',
      estado: 'ACTIVO',
    };
  }
}
