import {
  isSafeHttpUrl,
  type SourceAdapter,
  type SourceOpportunity,
} from '../core/index.js';

export class LeverAdapter implements SourceAdapter {
  public readonly sourceSystem = 'lever';

  public async *discover(
    siteId: string,
  ): AsyncIterableIterator<SourceOpportunity> {
    const cleanId = siteId.trim();
    if (!cleanId || cleanId.includes('/') || cleanId.includes('\\')) {
      throw new Error(`Invalid Lever site identifier: '${siteId}'`);
    }

    const encodedSiteId = encodeURIComponent(cleanId);
    const url = `https://api.lever.co/v0/postings/${encodedSiteId}?mode=json`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Rolevia/open-career-agent',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(
        `Lever API returned ${response.status} ${response.statusText} for ${url}`,
      );
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      throw new Error('Malformed Lever response: missing postings array');
    }

    for (const posting of payload) {
      if (!posting || typeof posting !== 'object') {
        continue;
      }

      const p = posting as {
        id?: string | number;
        text?: string;
        hostedUrl?: string;
        applyUrl?: string;
        createdAt?: number;
        [key: string]: unknown;
      };

      if (!p.id) {
        continue;
      }

      const candidateUrl = p.hostedUrl || p.applyUrl;
      const sourceUrl = isSafeHttpUrl(candidateUrl) ? candidateUrl : undefined;

      yield {
        sourceSystem: this.sourceSystem,
        sourceExternalId: String(p.id),
        ...(sourceUrl ? { sourceUrl } : {}),
        rawPayload: JSON.stringify({ ...p, _siteId: cleanId }),
        observedAt: new Date(),
      };
    }
  }
}
