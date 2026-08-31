import {
  AddApplicationEventInputSchema,
  ApplicationDetailResponseSchema,
  ApplicationListResponseSchema,
  AttachClaimEvidenceInputSchema,
  CandidateProfileResponseSchema,
  CareerMemoryMutationResponseSchema,
  CareerSignalsResponseSchema,
  CreateApplicationInputSchema,
  CreateCandidateClaimInputSchema,
  CreateSearchTargetInputSchema,
  DiscoveryRunListResponseSchema,
  OpportunityDetailResponseSchema,
  OpportunityListResponseSchema,
  SearchTargetListResponseSchema,
  SearchTargetSchema,
  TodayDashboardResponseSchema,
  TriggerDiscoveryRunResponseSchema,
  UpdateApplicationInputSchema,
  UpdateCandidateClaimInputSchema,
  UpdateSearchTargetInputSchema,
  AuthResponseSchema,
  AuthSessionSchema,
  LoginInputSchema,
  LogoutResponseSchema,
  RegisterInputSchema,
} from '@oca/schemas';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import {
  ApiClientError,
  ConflictError,
  CredentialError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  ServerError,
  UnauthorizedError,
  ValidationError,
} from './errors.js';

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RoleviaApiClientOptions {
  readonly baseUrl: string;
  readonly fetcher?: FetchImplementation;
  readonly defaultHeaders?: Record<string, string>;
  readonly credentialProvider?: CredentialProvider;
}

export interface ApiCredentials {
  readonly headers?: Readonly<Record<string, string>>;
  readonly credentials?: RequestCredentials;
}

export type CredentialProvider = () => ApiCredentials | Promise<ApiCredentials>;

export interface RequestOptions {
  readonly signal?: AbortSignal | undefined;
  readonly headers?: Record<string, string> | undefined;
}

export class RoleviaApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchImplementation;
  private readonly defaultHeaders: Record<string, string>;
  private readonly credentialProvider: CredentialProvider;

  public constructor(options: RoleviaApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? ((...args) => globalThis.fetch(...args));
    this.defaultHeaders = {
      accept: 'application/json',
      ...options.defaultHeaders,
    };
    this.credentialProvider =
      options.credentialProvider ?? (() => ({ credentials: 'same-origin' }));
  }

  public async register(
    input: Static<typeof RegisterInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof AuthResponseSchema>> {
    if (!Value.Check(RegisterInputSchema, input)) {
      throw new ValidationError('Invalid registration input.', input);
    }
    return this.request(
      '/auth/register',
      AuthResponseSchema,
      'POST',
      input,
      options,
      true,
    );
  }

  public async login(
    input: Static<typeof LoginInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof AuthResponseSchema>> {
    if (!Value.Check(LoginInputSchema, input)) {
      throw new ValidationError('Invalid login input.', input);
    }
    return this.request(
      '/auth/login',
      AuthResponseSchema,
      'POST',
      input,
      options,
      true,
    );
  }

  public async getSession(
    options?: RequestOptions,
  ): Promise<Static<typeof AuthSessionSchema>> {
    return this.request(
      '/auth/session',
      AuthSessionSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async logout(
    options?: RequestOptions,
  ): Promise<Static<typeof LogoutResponseSchema>> {
    return this.request(
      '/auth/logout',
      LogoutResponseSchema,
      'POST',
      undefined,
      options,
    );
  }

  public async getCareerProfile(
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof CandidateProfileResponseSchema>> {
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/profile`,
      CandidateProfileResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async createCandidateClaim(
    candidateId: string,
    input: Static<typeof CreateCandidateClaimInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof CareerMemoryMutationResponseSchema>> {
    if (!Value.Check(CreateCandidateClaimInputSchema, input)) {
      throw new ValidationError('Invalid create claim input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/claims`,
      CareerMemoryMutationResponseSchema,
      'POST',
      input,
      options,
    );
  }

  public async updateCandidateClaim(
    candidateId: string,
    claimId: string,
    input: Static<typeof UpdateCandidateClaimInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof CareerMemoryMutationResponseSchema>> {
    if (!Value.Check(UpdateCandidateClaimInputSchema, input)) {
      throw new ValidationError('Invalid update claim input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/claims/${encodeURIComponent(claimId)}`,
      CareerMemoryMutationResponseSchema,
      'PATCH',
      input,
      options,
    );
  }

  public async attachClaimEvidence(
    candidateId: string,
    claimId: string,
    input: Static<typeof AttachClaimEvidenceInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof CareerMemoryMutationResponseSchema>> {
    if (!Value.Check(AttachClaimEvidenceInputSchema, input)) {
      throw new ValidationError('Invalid attach evidence input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/claims/${encodeURIComponent(claimId)}/evidence`,
      CareerMemoryMutationResponseSchema,
      'POST',
      input,
      options,
    );
  }

  public async listOpportunities(
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof OpportunityListResponseSchema>> {
    return this.request(
      `/opportunities?candidateId=${encodeURIComponent(candidateId)}`,
      OpportunityListResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async getOpportunity(
    opportunityId: string,
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof OpportunityDetailResponseSchema> | null> {
    try {
      return await this.request(
        `/opportunities/${encodeURIComponent(opportunityId)}?candidateId=${encodeURIComponent(candidateId)}`,
        OpportunityDetailResponseSchema,
        'GET',
        undefined,
        options,
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    }
  }

  public async listSearchTargets(
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof SearchTargetListResponseSchema>> {
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/search-targets`,
      SearchTargetListResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async createSearchTarget(
    candidateId: string,
    input: Static<typeof CreateSearchTargetInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof SearchTargetSchema>> {
    if (!Value.Check(CreateSearchTargetInputSchema, input)) {
      throw new ValidationError('Invalid Search Target input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/search-targets`,
      SearchTargetSchema,
      'POST',
      input,
      options,
    );
  }

  public async updateSearchTarget(
    candidateId: string,
    targetId: string,
    input: Static<typeof UpdateSearchTargetInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof SearchTargetSchema>> {
    if (!Value.Check(UpdateSearchTargetInputSchema, input)) {
      throw new ValidationError('Invalid Search Target update.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/search-targets/${encodeURIComponent(targetId)}`,
      SearchTargetSchema,
      'PATCH',
      input,
      options,
    );
  }

  public async deleteSearchTarget(
    candidateId: string,
    targetId: string,
    options?: RequestOptions,
  ): Promise<boolean> {
    const url = `${this.baseUrl}/candidates/${encodeURIComponent(candidateId)}/search-targets/${encodeURIComponent(targetId)}`;
    const credentials = await this.resolveCredentials();
    const headers = {
      ...this.defaultHeaders,
      ...credentials.headers,
      ...options?.headers,
    };
    try {
      const res = await this.fetcher(url, {
        method: 'DELETE',
        headers,
        ...(credentials.credentials
          ? { credentials: credentials.credentials }
          : {}),
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      if (res.status === 404) return false;
      if (!res.ok) {
        throw this.createErrorFromStatus(res.status);
      }
      return true;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      throw new NetworkError(
        'Failed to execute delete search target request.',
        error,
      );
    }
  }

  public async runDiscovery(
    candidateId: string,
    targetId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof TriggerDiscoveryRunResponseSchema>> {
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/search-targets/${encodeURIComponent(targetId)}/run`,
      TriggerDiscoveryRunResponseSchema,
      'POST',
      undefined,
      options,
    );
  }

  public async getDiscoveryRuns(
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof DiscoveryRunListResponseSchema>> {
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/discovery-runs`,
      DiscoveryRunListResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async getTodayDashboard(
    candidateId: string,
    timeWindowDays?: number,
    options?: RequestOptions,
  ): Promise<Static<typeof TodayDashboardResponseSchema>> {
    const query = timeWindowDays ? `?timeWindowDays=${timeWindowDays}` : '';
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/today${query}`,
      TodayDashboardResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async getCareerSignals(
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof CareerSignalsResponseSchema>> {
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/career-signals`,
      CareerSignalsResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async listApplications(
    candidateId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof ApplicationListResponseSchema>> {
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/applications`,
      ApplicationListResponseSchema,
      'GET',
      undefined,
      options,
    );
  }

  public async getApplication(
    candidateId: string,
    applicationId: string,
    options?: RequestOptions,
  ): Promise<Static<typeof ApplicationDetailResponseSchema> | null> {
    try {
      return await this.request(
        `/candidates/${encodeURIComponent(candidateId)}/applications/${encodeURIComponent(applicationId)}`,
        ApplicationDetailResponseSchema,
        'GET',
        undefined,
        options,
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    }
  }

  public async createApplication(
    candidateId: string,
    input: Static<typeof CreateApplicationInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof ApplicationDetailResponseSchema>> {
    if (!Value.Check(CreateApplicationInputSchema, input)) {
      throw new ValidationError('Invalid create application input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/applications`,
      ApplicationDetailResponseSchema,
      'POST',
      input,
      options,
    );
  }

  public async updateApplication(
    candidateId: string,
    applicationId: string,
    input: Static<typeof UpdateApplicationInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof ApplicationDetailResponseSchema>> {
    if (!Value.Check(UpdateApplicationInputSchema, input)) {
      throw new ValidationError('Invalid update application input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/applications/${encodeURIComponent(applicationId)}`,
      ApplicationDetailResponseSchema,
      'PATCH',
      input,
      options,
    );
  }

  public async addApplicationEvent(
    candidateId: string,
    applicationId: string,
    input: Static<typeof AddApplicationEventInputSchema>,
    options?: RequestOptions,
  ): Promise<Static<typeof ApplicationDetailResponseSchema>> {
    if (!Value.Check(AddApplicationEventInputSchema, input)) {
      throw new ValidationError('Invalid add application event input.', input);
    }
    return this.request(
      `/candidates/${encodeURIComponent(candidateId)}/applications/${encodeURIComponent(applicationId)}/events`,
      ApplicationDetailResponseSchema,
      'POST',
      input,
      options,
    );
  }

  private async request<TSchemaType extends TSchema>(
    path: string,
    schema: TSchemaType,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: unknown,
    options?: RequestOptions,
    sensitiveResponse = false,
  ): Promise<Static<TSchemaType>> {
    const url = `${this.baseUrl}${path}`;
    const credentials = await this.resolveCredentials();
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...credentials.headers,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options?.headers,
    };

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        ...(credentials.credentials
          ? { credentials: credentials.credentials }
          : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        throw error;
      }
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'AbortError'
      ) {
        throw error;
      }
      throw new NetworkError('The opportunity API is unavailable.', error);
    }

    if (!response.ok) {
      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        // Ignored if non-JSON
      }
      throw this.createErrorFromStatus(response.status, responseBody);
    }

    const responseBody: unknown = await response.json();
    if (!Value.Check(schema, responseBody)) {
      throw new ValidationError(
        'Response did not match schema contract.',
        sensitiveResponse ? undefined : responseBody,
      );
    }
    return responseBody;
  }

  private async resolveCredentials(): Promise<ApiCredentials> {
    try {
      return await this.credentialProvider();
    } catch {
      throw new CredentialError();
    }
  }

  private createErrorFromStatus(
    status: number,
    body?: unknown,
  ): ApiClientError {
    let message = `The opportunity API returned status ${status}.`;
    if (body && typeof body === 'object') {
      if ('message' in body && typeof body.message === 'string') {
        message = body.message;
      } else if (
        'error' in body &&
        body.error &&
        typeof body.error === 'object' &&
        'message' in body.error &&
        typeof body.error.message === 'string'
      ) {
        message = body.error.message;
      }
    }
    switch (status) {
      case 401:
        return new UnauthorizedError(message, body);
      case 403:
        return new ForbiddenError(message, body);
      case 404:
        return new NotFoundError(message, body);
      case 409:
        return new ConflictError(message, body);
      default:
        if (status >= 500) {
          return new ServerError(message, status, body);
        }
        return new ApiClientError(message, 'UNKNOWN_ERROR', status, body);
    }
  }
}
