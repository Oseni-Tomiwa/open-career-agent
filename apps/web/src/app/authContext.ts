import type { AuthSessionSchema } from '@oca/schemas';
import type { Static } from '@sinclair/typebox';
import { createContext, use } from 'react';

import { browserConfig } from '../config.js';

export type AuthSession = Static<typeof AuthSessionSchema>;

export interface AuthContextValue {
  readonly session: AuthSession | null;
  readonly candidateId?: string;
  readonly cloud: boolean;
  readonly signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  cloud: false,
  signOut: () => Promise.resolve(),
  ...(browserConfig.developmentCandidateId
    ? { candidateId: browserConfig.developmentCandidateId }
    : {}),
});

export function useAuth(): AuthContextValue {
  return use(AuthContext);
}
