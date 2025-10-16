import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ClientesAppModule } from './module.ts';

async function bootstrap() {
  const app = await NestFactory.create(ClientesAppModule);
  const port = Number(process.env.CLIENTES_PORT || 3005);
  await app.listen(port);
  console.log(`[clientes] on ${port}`);
}
bootstrap();
