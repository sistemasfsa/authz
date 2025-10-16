#!/usr/bin/env node
import 'dotenv/config';               // lee .env automáticamente
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AuthzKcModule } from '../src/admin/authz-kc.module';
import type { Manifest } from '../src/admin/manifest.types';
import { AuthzSyncService } from '../src/admin/authz-kc.service';

function envOrThrow(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in environment`);
  return v;
}

async function makeAppFromEnv() {
  const baseUrl = envOrThrow('AUTHZ_BASE_URL');
  const realm = envOrThrow('AUTHZ_REALM');
  const clientId = envOrThrow('AUTHZ_CLIENT_ID');
  const clientSecret = envOrThrow('AUTHZ_CLIENT_SECRET');
  const timeoutMs = process.env.AUTHZ_TIMEOUT_MS ? Number(process.env.AUTHZ_TIMEOUT_MS) : undefined;

  return NestFactory.createApplicationContext(
    AuthzKcModule.forRoot({ baseUrl, realm, clientId, clientSecret, timeoutMs }),
    { logger: false },
  );
}

const program = new Command();
program.name('authz').description('Herramientas de manifiestos AuthZ');

program.command('manifest init')
  .option('-o, --out <file>', 'archivo de salida', 'authz.manifest.yml')
  .action(async (opts) => {
    const app = await makeAppFromEnv();
    const svc = app.get(AuthzSyncService);
    const manifest: Manifest = await svc.createManifest();
    const yaml = (await import('yaml')).stringify({ ...manifest, generatedAt: new Date().toISOString() });
    const file = path.resolve(process.cwd(), opts.out);
    fs.writeFileSync(file, yaml, 'utf8');
    await app.close();
    console.log(`Manifest generado: ${file}`);
  });

program.command('manifest sync')
  .requiredOption('-f, --file <file>', 'manifest YAML/JSON')
  .option('--dry-run', 'no aplica cambios, solo muestra plan', false)
  .action(async (opts) => {
    const file = path.resolve(process.cwd(), opts.file);
    const raw = fs.readFileSync(file, 'utf8');
    const manifest: Manifest = file.endsWith('.yml') || file.endsWith('.yaml')
      ? (await import('yaml')).parse(raw)
      : JSON.parse(raw);

    const app = await makeAppFromEnv();
    const svc = app.get(AuthzSyncService);
    const res = await svc.sync(manifest, { dryRun: !!opts.dryRun });
    await app.close();

    if ((res as any).dryRun) {
      console.log('DRY RUN - plan:', JSON.stringify((res as any).plan, null, 2));
    } else {
      console.log(`Aplicado. Pasos ejecutados: ${(res as any).applied}`);
    }
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
