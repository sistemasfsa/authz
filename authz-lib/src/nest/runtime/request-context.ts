import { AsyncLocalStorage } from 'node:async_hooks';

type Store = {
  subjectBearer?: string;
  subjectRefresh?: string;
};

const als = new AsyncLocalStorage<Store>();

export const RequestContext = {
  /** Ejecuta un callback dentro de un nuevo contexto ALS */
  run<T>(initial: Store, cb: () => T) {
    return als.run(initial, cb);
  },

  /** Establece el access token actual */
  setBearer(token?: string) {
    const s = als.getStore();
    if (s) s.subjectBearer = token;
  },

  /** Obtiene el access token actual */
  getBearer(): string | undefined {
    return als.getStore()?.subjectBearer;
  },

  /** Establece el refresh token actual */
  setRefresh(token?: string) {
    const s = als.getStore();
    if (s) s.subjectRefresh = token;
  },

  /** Obtiene el refresh token actual */
  getRefresh(): string | undefined {
    return als.getStore()?.subjectRefresh;
  },

  /** Devuelve todo el store (solo lectura) */
  getStore(): Readonly<Store> | undefined {
    return als.getStore();
  },
};
