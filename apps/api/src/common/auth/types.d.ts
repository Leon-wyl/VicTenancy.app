import type { Principal } from './principal';

declare global {
  namespace Express {
    interface Request {
      user?: Principal;
    }
  }
}

export {};
