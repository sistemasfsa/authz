// src/runtime/request-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

type Store = { subjectBearer?: string };
const als = new AsyncLocalStorage<Store>();

export const RequestContext = {
  run<T>(initial: Store, cb: () => T) {
    return als.run(initial, cb);
  },
  setBearer(token?: string) {
    const s = als.getStore();
    if (s) s.subjectBearer = token;
  },
  getBearer(): string | undefined {
    return als.getStore()?.subjectBearer;
  },
};
