import 'dotenv/config';
import express from 'express';
import * as jose from 'jose';

const PORT = Number(process.env.PORT || 4444);
const REALM = process.env.REALM || 'test';
const ISSUER = `http://localhost:${PORT}/realms/${REALM}`;
const AUDIENCE = process.env.AUDIENCE || 'your-api-audience';
const FRONT_CLIENT = process.env.FRONT_CLIENT || 'frontend-client-id';

const app = express();
// ✅ soporta JSON y x-www-form-urlencoded (requerido por client_credentials / token-exchange)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── JWKS ───────────────────────────────────────────────────────────────
const { publicKey, privateKey } = await jose.generateKeyPair('RS256');
const pubJwk = await jose.exportJWK(publicKey);
pubJwk.use = 'sig';
pubJwk.kid = 'mock-kid-1';
const JWKS = { keys: [pubJwk] };

// ── OIDC discovery + certs ────────────────────────────────────────────
app.get(`/realms/${REALM}/.well-known/openid-configuration`, (_req, res) => {
  res.json({
    issuer: ISSUER,
    jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
    token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  });
});
app.get(`/realms/${REALM}/protocol/openid-connect/certs`, (_req, res) => {
  res.json(JWKS);
});

// ── helpers ───────────────────────────────────────────────────────────
function nowPayload(aud, azp, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud,
    azp,
    sub: 'user-123',
    iat: now,
    nbf: now - 5,
    exp: now + 3600,
    realm_access: { roles: ['reader'] },
    resource_access: { [azp]: { roles: ['reader'] } },
    ...extra,
  };
}

async function signToken(payload, aud) {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'mock-kid-1' })
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setExpirationTime('1h')
    .sign(privateKey);
}

// ── token endpoint ─ client_credentials + token-exchange + fallback JSON
app.post(`/realms/${REALM}/protocol/openid-connect/token`, async (req, res) => {
  try {
    const p = req.body ?? {};
    const grant = p.grant_type;

    // === client_credentials ===
    if (grant === 'client_credentials') {
      const aud = p.audience || AUDIENCE;
      const azp = p.client_id || FRONT_CLIENT;
      const payload = nowPayload(aud, azp);
      const token = await signToken(payload, aud);
      return res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile',
      });
    }

    // === token-exchange ===
    if (grant === 'urn:ietf:params:oauth:grant-type:token-exchange') {
      const aud = p.audience || AUDIENCE;
      // const subjectToken = p.subject_token; // (opcional) podrías validarlo
      const azp = p.client_id || FRONT_CLIENT;
      const payload = nowPayload(aud, azp, { sub: 'exchanged-user' });
      const token = await signToken(payload, aud);
      return res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile',
      });
    }

    // === Fallback JSON (para mint rápido con body JSON) ===
    const {
      aud = AUDIENCE,
      azp = FRONT_CLIENT,
      realm_roles = ['reader'],
      client_roles = ['reader'],
      sucursalId,
      codigoExt,
      sub = 'user-123',
    } = p;

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: ISSUER,
      aud,
      azp,
      sub,
      iat: now,
      nbf: now - 5,
      exp: now + 3600,
      realm_access: { roles: realm_roles },
      resource_access: { [azp]: { roles: client_roles } },
      ...(sucursalId ? { sucursalId: String(sucursalId) } : {}),
      ...(codigoExt ? { codigoExt: String(codigoExt) } : {}),
    };

    const token = await signToken(payload, aud);
    res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[issuer] ${ISSUER}`);
  console.log(`JWKS: ${ISSUER}/protocol/openid-connect/certs`);
  console.log(`Token: POST ${ISSUER}/protocol/openid-connect/token`);
});
