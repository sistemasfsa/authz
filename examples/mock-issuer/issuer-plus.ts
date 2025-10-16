import "dotenv/config";
import express from "express";
import * as jose from "jose";

const PORT = Number(process.env.PORT || 4444);
const REALM = process.env.REALM || "test";
const ISSUER = `http://localhost:${PORT}/realms/${REALM}`;
const DEFAULT_AUD = process.env.AUDIENCE || "your-api-audience";
const FRONT_CLIENT = process.env.FRONT_CLIENT || "frontend-client-id";
const API_CLIENT = process.env.API_CLIENT || "api-client-id";

const app = express();
app.use(express.json());

// ===== RSA & JWKS =====
const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
const pubJwk = await jose.exportJWK(publicKey);
pubJwk.use = "sig";
pubJwk.kid = "mock-kid-1";
const JWKS = { keys: [pubJwk] };

// ===== Well-known =====
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

// ===== Helpers =====
type Roles = string[]; // client roles
type TokenShape = {
  iss: string;
  aud: string | string[];
  azp: string;
  sub: string;
  iat: number;
  nbf: number;
  exp: number;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: Roles }>;
  sucursalId?: string;
  codigoExt?: string;
};

function asArray<T>(x: T | T[]) {
  return Array.isArray(x) ? x : [x];
}

async function signJwt(
  payload: Partial<TokenShape> & { azp: string; aud: string | string[] }
) {
  const now = Math.floor(Date.now() / 1000);
  const p: TokenShape = {
    iss: ISSUER,
    aud: payload.aud,
    azp: payload.azp,
    sub: payload.sub ?? "user-123",
    iat: now,
    nbf: now - 5,
    exp: now + 3600,
    realm_access: payload.realm_access ?? { roles: [] },
    resource_access: payload.resource_access ?? {
      [payload.azp]: { roles: [] },
    },
    ...(payload.sucursalId ? { sucursalId: String(payload.sucursalId) } : {}),
    ...(payload.codigoExt ? { codigoExt: String(payload.codigoExt) } : {}),
  };
  return new jose.SignJWT(p as any)
    .setProtectedHeader({ alg: "RS256", kid: "mock-kid-1" })
    .setIssuer(ISSUER)
    .setAudience(p.aud)
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function verifyJwt(token: string) {
  const jwks = jose.createLocalJWKSet(JWKS as any);
  const { payload } = await jose.jwtVerify(token, jwks, { issuer: ISSUER });
  return payload as any as TokenShape;
}

// ===== Token endpoint =====
app.post(`/realms/${REALM}/protocol/openid-connect/token`, async (req, res) => {
  try {
    const {
      grant_type,
      client_id,
      client_secret,
      // Token Exchange
      subject_token,
      requested_token_type,
      audience, // target audience/azp para el token resultante
      // Mint directo (mock convenient)
      aud = DEFAULT_AUD,
      azp = FRONT_CLIENT,
      realm_roles = ["reader"],
      client_roles = ["reader"],
      sucursalId,
      codigoExt,
      sub = "user-123",
    } = req.body || {};

    // --- 1) Client Credentials (mock simple) ---
    if (grant_type === "client_credentials") {
      if (!client_id || !client_secret) {
        return res.status(400).json({ error: "invalid_client" });
      }
      // En un Keycloak real validarías en DB; aquí aceptamos cualquier secret.
      const token = await signJwt({
        aud: aud || DEFAULT_AUD,
        azp: client_id,
        sub: `service-account-${client_id}`,
        resource_access: { [client_id]: { roles: ["service"] } },
      });
      return res.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    // --- 2) Token Exchange (RFC 8693) ---
    if (grant_type === "urn:ietf:params:oauth:grant-type:token-exchange") {
      if (!subject_token)
        return res
          .status(400)
          .json({ error: "invalid_request: missing subject_token" });
      const source = await verifyJwt(subject_token);

      const targetAzp = audience || API_CLIENT; // target client
      // 👇 Aquí podrías imponer políticas:
      //  - allowed source.azp ∈ [FRONT_CLIENT]
      //  - allowed exchanges → audience == API_CLIENT
      if (!asArray(source.aud).includes(DEFAULT_AUD)) {
        return res
          .status(403)
          .json({ error: "forbidden: source aud mismatch" });
      }

      // Propagamos identidad (sub) y opcionalmente sucursal/codigoExt
      const exchanged = await signJwt({
        aud: aud || DEFAULT_AUD,
        azp: targetAzp,
        sub: source.sub,
        sucursalId: source.sucursalId,
        codigoExt: source.codigoExt,
        resource_access: {
          [targetAzp]: { roles: ["reader"] }, // en real KC se decide por permisos/policies
        },
      });

      return res.json({
        access_token: exchanged,
        issued_token_type:
          requested_token_type ||
          "urn:ietf:params:oauth:token-type:access_token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    // --- 3) Mint directo (atajo para pruebas de roles/sucursal) ---
    const token = await signJwt({
      aud,
      azp,
      sub,
      realm_access: { roles: realm_roles },
      resource_access: { [azp]: { roles: client_roles } },
      sucursalId,
      codigoExt,
    });
    res.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[issuer+] ${ISSUER}`);
  console.log(`JWKS: ${ISSUER}/protocol/openid-connect/certs`);
  console.log(`Token: POST ${ISSUER}/protocol/openid-connect/token`);
});
