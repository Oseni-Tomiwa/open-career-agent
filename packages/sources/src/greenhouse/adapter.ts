import type { SourceAdapter, SourceOpportunity } from '../core/index.js';

export class GreenhouseAdapter implements SourceAdapter {
  public readonly sourceSystem = 'greenhouse';

  public async *discover(
    boardId: string,
  ): AsyncIterableIterator<SourceOpportunity> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs?content=true`;

    // We will use native fetch.
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Rolevia/open-career-agent',
      },
      // Timeout is natively not easily supported on all fetch implementations,
      // but in Node 22+ we can use AbortSignal.timeout
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(
        `Greenhouse API returned ${response.status} ${response.statusText} for ${url}`,
      );
    }

    const payload = (await response.json()) as {
      jobs?: Array<{
        id: number | string;
        absolute_url: string;
        updated_at?: string;
        [key: string]: unknown;
      }>;
    };

    if (!payload || !payload.jobs || !Array.isArray(payload.jobs)) {
      throw new Error('Malformed Greenhouse response: missing jobs array');
    }

    for (const job of payload.jobs) {
      yield {
        sourceSystem: this.sourceSystem,
        sourceExternalId: String(job.id),
        sourceUrl: job.absolute_url,
        rawPayload: JSON.stringify(job),
        observedAt: new Date(),
      };
    }
  }
}
