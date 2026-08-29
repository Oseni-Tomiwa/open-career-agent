import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export class ConfigurationError extends Error {
  public constructor(scope: string, details: readonly string[]) {
    super(`Invalid ${scope} configuration: ${details.join('; ')}`);
    this.name = 'ConfigurationError';
  }
}

export function validateConfiguration<T extends TSchema>(
  scope: string,
  schema: T,
  input: unknown,
): Static<T> {
  if (Value.Check(schema, input)) {
    return input;
  }

  const details = [...Value.Errors(schema, input)].map(
    (error) => `${error.path || 'value'} ${error.message}`,
  );
  throw new ConfigurationError(scope, details);
}

export function parsePositiveInteger(name: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigurationError(name, ['must be a positive integer']);
  }

  return parsed;
}

export function parseUrl(name: string, value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new ConfigurationError(name, ['must be an absolute URL']);
  }
}
