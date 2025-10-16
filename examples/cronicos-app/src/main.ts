import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module.ts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.CRONICOS_PORT || 3002);
  await app.listen(port);
  console.log(`[cronicos] on ${port}`);
}
bootstrap();
