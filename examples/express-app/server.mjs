import 'dotenv/config';
import express from 'express';
import { authJwt, authorize } from '@sistemas-fsa/authz/express';

const ISSUER = process.env.ISSUER || 'http://localhost:4444/realms/test';
const AUDIENCE = process.env.AUDIENCE || 'your-api-audience';
const FRONT_CLIENT = process.env.FRONT_CLIENT || 'frontend-client-id';
const PORT = Number(process.env.PORT || 3001);

const app = express();

// Verificación global del JWT + enrich de req.auth
app.use(authJwt({
  issuer: ISSUER,
  audience: AUDIENCE,
  requireSucursalDataDefault: false,
  claimNames: { sucursalId: 'sucursalId', codigoExt: 'codigoExt' },
  clockTolerance: 10
}));

// GET: reader|admin del FRONT_CLIENT
app.get(
  '/items',
  authorize({
    allowedAzp: [FRONT_CLIENT],
    requiredClientRoles: { [FRONT_CLIENT]: ['reader', 'admin'] },
    requireSucursalData: false
  }),
  (req, res) => res.json({ ok: true, user: req.auth })
);

// POST: solo admin + sucursal obligatoria
app.post(
  '/items',
  authorize({
    allowedAzp: [FRONT_CLIENT],
    requiredClientRoles: { [FRONT_CLIENT]: ['admin'] },
    requireSucursalData: true
  }),
  (req, res) => res.status(201).json({ created: true })
);

app.listen(PORT, () => console.log(`[express] on ${PORT}`));
