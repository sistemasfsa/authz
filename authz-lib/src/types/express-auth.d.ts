import 'express-serve-static-core';
import type { AuthContext } from '../shared/contracts';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    tokenPayload?: any;
  }
}
