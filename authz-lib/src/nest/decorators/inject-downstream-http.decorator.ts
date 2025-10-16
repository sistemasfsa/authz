// src/nest/decorators/inject-downstream-http.decorator.ts
import { Inject } from '@nestjs/common';
import { DownstreamToken } from '../runtime/authz-kc-run.module';

export const InjectDownstreamHttp = (name: string) => Inject(DownstreamToken(name));
