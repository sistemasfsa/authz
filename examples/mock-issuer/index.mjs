import 'dotenv/config';
import express from 'express';
import * as jose from 'jose';

const PORT = Number(process.env.PORT || 4444);
const REALM = process.env.REALM || 'test';
const ISSUER = `http://localhost:${PORT}/realms/${REALM}`;
const AUDIENCE = process.env.AUDIENCE || 'your-api-audience';
const FRONT_CLIENT = process.env.FRONT_CLIENT || 'frontend-client-id';

const app = express();
app.use(express.json());

// ──────────────────────────────────────────────
// Generamos una key RSA al vuelo y publicamos JWKS
// ──────────────────────────────────────────────
const { publicKey, privateKey } = await jose.generateKeyPair('RS256');
const pubJwk = await jose.exportJWK(publicKey);
pubJwk.use = 'sig';
pubJwk.kid = 'mock-kid-1';

const JWKS = { keys: [pubJwk] };

// Well-known (mínimo) y certs al estilo Keycloak
app.get(`/realms/${REALM}/.well-known/openid-configuration`, (_req, res) => {
  res.json({
    issuer: ISSUER,
    jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
    token_endpoint: `${ISSUER}/protocol/openid-connect/token`
  });
});

app.get(`/realms/${REALM}/protocol/openid-connect/certs`, (_req, res) => {
  res.json(JWKS);
});

// Endpoint para mintear tokens rápidamente
app.post(`/realms/${REALM}/protocol/openid-connect/token`, async (req, res) => {
  try {
    // Podés pasar overrides en body si querés (aud, azp, roles, sucursalId, codigoExt)
    const {
      aud = AUDIENCE,
      azp = FRONT_CLIENT,
      realm_roles = ['reader'],
      client_roles = ['reader'],
      sucursalId,
      codigoExt,
      sub = 'user-123'
    } = req.body || {};

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: ISSUER,
      aud,                 // puede ser string o array; usemos array para tu middleware
      azp,
      sub,
      iat: now,
      nbf: now - 5,
      exp: now + 60 * 60,
      realm_access: { roles: realm_roles },
      resource_access: { [azp]: { roles: client_roles } },
      ...(sucursalId ? { sucursalId: String(sucursalId) } : {}),
      ...(codigoExt ? { codigoExt: String(codigoExt) } : {})
    };

    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-kid-1' })
      .setIssuer(ISSUER)
      .setAudience(aud)
      .setExpirationTime('1h')
      .sign(privateKey);

    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[issuer] ${ISSUER}`);
  console.log(`JWKS: ${ISSUER}/protocol/openid-connect/certs`);
  console.log(`Token: POST ${ISSUER}/protocol/openid-connect/token`);
});
