import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller.ts';

@Module({
  controllers: [ClientesController],
})
export class ClientesAppModule {}
