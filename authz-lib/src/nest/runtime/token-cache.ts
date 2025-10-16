// src/runtime/token-cache.ts
import {jwtDecode} from 'jwt-decode';

type Jwt = { exp?: number };

export class TokenCache {
  private map = new Map<string, { token: string; exp: number }>();
  constructor(private skewSec: number) {}

  private key(subjectToken: string, audience: string) {
    // Ideal: hashear subjectToken con sha256 si querés endurecer
    return `${audience}::${subjectToken}`;
  }

  get(subjectToken: string, audience: string) {
    const k = this.key(subjectToken, audience);
    const v = this.map.get(k);
    if (!v) return undefined;
    const now = Math.floor(Date.now() / 1000);
    if (v.exp - this.skewSec <= now) {
      this.map.delete(k);
      return undefined;
    }
    return v.token;
  }

  set(subjectToken: string, audience: string, accessToken: string) {
    const decoded = jwtDecode<Jwt>(accessToken);
    const exp = decoded.exp ?? Math.floor(Date.now() / 1000) + 60;
    const k = this.key(subjectToken, audience);
    this.map.set(k, { token: accessToken, exp });
  }
}
