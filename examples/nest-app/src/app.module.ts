import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule, ApiJwtGuard } from '@sistemas-fsa/authz/nest';
import { ItemsController } from './items.controller.ts';

const parseCsv = (v?: string) =>
  (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

@Module({
  imports: [
    AuthModule.forRoot({
      issuer: process.env.ISSUER || 'http://localhost:4444/realms/test',
      audience: process.env.AUDIENCE || 'your-api-audience',
      allowedAzpDefault: parseCsv(process.env.ALLOWED_AZP).length
        ? parseCsv(process.env.ALLOWED_AZP)
        : [process.env.FRONT_CLIENT || 'frontend-client-id'],
      requireSucursalDataDefault: false,
      claimNames: { sucursalId: 'sucursalId', codigoExt: 'codigoExt' },
      clockTolerance: 10,
    }),
  ],
  controllers: [ItemsController],
  providers: [
    // 👇 ÚNICO APP_GUARD. Inyecta la instancia del guard que publica AuthModule.
    {
      provide: APP_GUARD,
      useFactory: (g: ApiJwtGuard) => g, // 👈 usa la instancia ya creada por AuthModule
      inject: [ApiJwtGuard],
    },
  ],
})
export class AppModule {}
