import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3002);
  // eslint-disable-next-line no-console
  console.log('[nest] on 3002');
}
bootstrap();
