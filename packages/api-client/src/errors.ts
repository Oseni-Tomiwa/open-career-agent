export type ApiClientErrorCode =
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export class ApiClientError extends Error {
  public constructor(
    message: string,
    public readonly code: ApiClientErrorCode,
    public readonly statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class NetworkError extends ApiClientError {
  public constructor(
    message = 'The opportunity API is unavailable.',
    details?: unknown,
  ) {
    super(message, 'NETWORK_ERROR', undefined, details);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends ApiClientError {
  public constructor(
    message = 'The API response did not match its contract.',
    details?: unknown,
  ) {
    super(message, 'VALIDATION_ERROR', undefined, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiClientError {
  public constructor(
    message = 'The requested resource was not found.',
    details?: unknown,
  ) {
    super(message, 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiClientError {
  public constructor(
    message = 'A state or concurrency conflict occurred.',
    details?: unknown,
  ) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends ApiClientError {
  public constructor(
    message = 'Authentication is required to access this resource.',
    details?: unknown,
  ) {
    super(message, 'UNAUTHORIZED', 401, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiClientError {
  public constructor(
    message = 'Access to this resource is forbidden.',
    details?: unknown,
  ) {
    super(message, 'FORBIDDEN', 403, details);
    this.name = 'ForbiddenError';
  }
}

export class ServerError extends ApiClientError {
  public constructor(
    message = 'The Rolevia server encountered an internal error.',
    statusCode = 500,
    details?: unknown,
  ) {
    super(message, 'SERVER_ERROR', statusCode, details);
    this.name = 'ServerError';
  }
}
