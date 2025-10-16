// examples/nest-app/src/token.controller.ts
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { KC_TOKEN_SVC, KcTokenService, KcTokenExchangeService, Public } from '@sistemas-fsa/authz/nest';

@Controller('_debug/token')
@Public()
export class TokenController {
  constructor(
    @Inject(KC_TOKEN_SVC) private readonly svc: KcTokenService,
    private readonly xchg: KcTokenExchangeService,
  ) {}

  @Get('client')
  async client() {
    const t = await this.svc.getToken();
    return { ...t, access_token: `len:${t.access_token.length}` };
  }

  @Get('exchange')
  async exchange(@Query('aud') aud = 'target-api-aud') {
    const t = await this.svc.getToken();
    const ex = await this.xchg.exchange(t.access_token, aud);
    return { ...ex, access_token: `len:${ex.access_token.length}`, audience: aud };
  }
}
