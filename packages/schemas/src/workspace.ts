import { Type, type Static } from '@sinclair/typebox';

const WorkspaceTimestampSchema = Type.String({
  pattern:
    '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$',
});
export const InitializeLocalWorkspaceInputSchema = Type.Object(
  {},
  { additionalProperties: false },
);
export const LocalWorkspaceReadySchema = Type.Object(
  {
    mode: Type.Literal('local'),
    state: Type.Literal('READY'),
    candidate: Type.Object(
      {
        id: Type.String({ minLength: 1 }),
        createdAt: WorkspaceTimestampSchema,
        updatedAt: WorkspaceTimestampSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export const LocalWorkspaceStatusSchema = Type.Union([
  Type.Object(
    { mode: Type.Literal('local'), state: Type.Literal('SETUP_REQUIRED') },
    { additionalProperties: false },
  ),
  LocalWorkspaceReadySchema,
]);
export type LocalWorkspaceReady = Static<typeof LocalWorkspaceReadySchema>;
export type LocalWorkspaceStatus = Static<typeof LocalWorkspaceStatusSchema>;
