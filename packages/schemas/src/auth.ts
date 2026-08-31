import { Type } from '@sinclair/typebox';

export const AuthTransportSchema = Type.Union([
  Type.Literal('cookie'),
  Type.Literal('bearer'),
]);

export const RegisterInputSchema = Type.Object({
  email: Type.String({
    minLength: 3,
    maxLength: 320,
    pattern: '^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$',
  }),
  password: Type.String({ minLength: 12, maxLength: 256 }),
  transport: Type.Optional(AuthTransportSchema),
});

export const LoginInputSchema = Type.Object({
  email: Type.String({ minLength: 1, maxLength: 320 }),
  password: Type.String({ minLength: 1, maxLength: 256 }),
  transport: Type.Optional(AuthTransportSchema),
});

export const AuthSessionSchema = Type.Object({
  user: Type.Object({
    id: Type.String(),
    email: Type.String(),
  }),
  candidateIds: Type.Array(Type.String()),
  primaryCandidateId: Type.String(),
  expiresAt: Type.String(),
});

export const AuthResponseSchema = Type.Object({
  session: AuthSessionSchema,
  token: Type.Optional(Type.String()),
});

export const LogoutResponseSchema = Type.Object({ revoked: Type.Boolean() });
