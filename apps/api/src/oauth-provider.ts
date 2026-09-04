import { createPublicKey, verify } from 'node:crypto';

import type { ApiConfig, OAuthProviderConfig } from '@oca/config/server';

export type OAuthProviderName = 'google' | 'apple';

export interface OAuthIdentity {
  readonly provider: OAuthProviderName;
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified: boolean;
}

export interface OAuthProviderAdapter {
  authorizationUrl(input: {
    readonly state: string;
    readonly nonce: string;
    readonly redirectUri: string;
  }): string;
  exchange(input: {
    readonly code: string;
    readonly nonce: string;
    readonly redirectUri: string;
  }): Promise<OAuthIdentity>;
}

interface ProviderDefinition {
  readonly name: OAuthProviderName;
  readonly config: OAuthProviderConfig;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  readonly issuer: string;
  readonly scope: string;
  readonly responseMode?: string;
}

export function configuredOAuthProviders(
  config: ApiConfig,
): Readonly<Partial<Record<OAuthProviderName, OAuthProviderAdapter>>> {
  return {
    ...(config.googleOAuth
      ? {
          google: new OidcProvider({
            name: 'google',
            config: config.googleOAuth,
            authorizationEndpoint:
              'https://accounts.google.com/o/oauth2/v2/auth',
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
            jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
            issuer: 'https://accounts.google.com',
            scope: 'openid email',
          }),
        }
      : {}),
    ...(config.appleOAuth
      ? {
          apple: new OidcProvider({
            name: 'apple',
            config: config.appleOAuth,
            authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
            tokenEndpoint: 'https://appleid.apple.com/auth/token',
            jwksUri: 'https://appleid.apple.com/auth/keys',
            issuer: 'https://appleid.apple.com',
            scope: 'email',
          }),
        }
      : {}),
  };
}

class OidcProvider implements OAuthProviderAdapter {
  public constructor(private readonly definition: ProviderDefinition) {}

  public authorizationUrl(input: {
    readonly state: string;
    readonly nonce: string;
    readonly redirectUri: string;
  }): string {
    const url = new URL(this.definition.authorizationEndpoint);
    url.searchParams.set('client_id', this.definition.config.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.definition.scope);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    if (this.definition.responseMode) {
      url.searchParams.set('response_mode', this.definition.responseMode);
    }
    return url.toString();
  }

  public async exchange(input: {
    readonly code: string;
    readonly nonce: string;
    readonly redirectUri: string;
  }): Promise<OAuthIdentity> {
    const response = await fetch(this.definition.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.definition.config.clientId,
        client_secret: this.definition.config.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok) throw new Error('OAuth token exchange failed.');
    const body = (await response.json()) as { id_token?: unknown };
    if (typeof body.id_token !== 'string') {
      throw new Error('OAuth identity token missing.');
    }
    const claims = await verifyIdToken(body.id_token, {
      audience: this.definition.config.clientId,
      issuer: this.definition.issuer,
      jwksUri: this.definition.jwksUri,
      nonce: input.nonce,
    });
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new Error('OAuth subject missing.');
    }
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    const verified =
      claims.email_verified === true || claims.email_verified === 'true';
    return {
      provider: this.definition.name,
      subject: claims.sub,
      ...(email ? { email } : {}),
      emailVerified: verified,
    };
  }
}

async function verifyIdToken(
  token: string,
  expected: {
    readonly audience: string;
    readonly issuer: string;
    readonly jwksUri: string;
    readonly nonce: string;
  },
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token.');
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error('Malformed identity token.');
  }
  const header = JSON.parse(
    Buffer.from(headerPart, 'base64url').toString('utf8'),
  ) as { alg?: unknown; kid?: unknown };
  const claims = JSON.parse(
    Buffer.from(payloadPart, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Unsupported identity token signature.');
  }
  const jwksResponse = await fetch(expected.jwksUri);
  if (!jwksResponse.ok) throw new Error('Provider keys unavailable.');
  const jwks = (await jwksResponse.json()) as {
    keys?: Array<Record<string, unknown> & { kid?: unknown }>;
  };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Identity signing key unavailable.');
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url'),
  );
  const now = Math.floor(Date.now() / 1000);
  const audience = claims.aud;
  if (
    !valid ||
    claims.iss !== expected.issuer ||
    (audience !== expected.audience &&
      !(Array.isArray(audience) && audience.includes(expected.audience))) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= now ||
    claims.nonce !== expected.nonce
  ) {
    throw new Error('Identity token validation failed.');
  }
  return claims;
}
