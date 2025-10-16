// src/runtime/kc-http.ts
import axios from "axios";
import { AuthzCoreConfig, ExchangeResult } from "./types";
import * as qs from "querystring";

export class KcHttp {
  constructor(private cfg: AuthzCoreConfig) {}

  private tokenEndpoint() {
    const path = this.cfg.tokenEndpointPath ?? "/protocol/openid-connect/token";
    return `${this.cfg.realmUrl.replace(/\/$/, "")}${path}`;
  }

  async tokenExchange(params: {
    subjectToken: string;
    audience: string;
  }): Promise<ExchangeResult> {
    const body = qs.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      subject_token: params.subjectToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      audience: params.audience,
    });

    const { data } = await axios.post(this.tokenEndpoint(), body, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      timeout: 5000,
    });
    return data as ExchangeResult;
  }

  async clientCredentials(audience?: string): Promise<ExchangeResult> {
    const body = qs.stringify({
      grant_type: "client_credentials",
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      ...(audience ? { audience } : {}),
    });

    const { data } = await axios.post(this.tokenEndpoint(), body, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      timeout: 5000,
    });
    return data as ExchangeResult;
  }
}
