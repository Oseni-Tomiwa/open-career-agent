import {
  isSafeHttpUrl,
  type SourceAdapter,
  type SourceOpportunity,
} from '../core/index.js';

export class AshbyAdapter implements SourceAdapter {
  public readonly sourceSystem = 'ashby';

  public async *discover(
    boardId: string,
  ): AsyncIterableIterator<SourceOpportunity> {
    const cleanId = boardId.trim();
    if (!cleanId || cleanId.includes('/') || cleanId.includes('\\')) {
      throw new Error(`Invalid Ashby board identifier: '${boardId}'`);
    }

    const encodedBoardId = encodeURIComponent(cleanId);
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodedBoardId}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Rolevia/open-career-agent',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(
        `Ashby API returned ${response.status} ${response.statusText} for ${url}`,
      );
    }

    const payload = (await response.json()) as {
      jobs?: Array<{
        id: string | number;
        jobUrl?: string;
        [key: string]: unknown;
      }>;
    };

    if (!payload || !payload.jobs || !Array.isArray(payload.jobs)) {
      throw new Error('Malformed Ashby response: missing jobs array');
    }

    for (const job of payload.jobs) {
      if (!job || !job.id) continue;

      const sourceUrl = isSafeHttpUrl(job.jobUrl) ? job.jobUrl : undefined;

      yield {
        sourceSystem: this.sourceSystem,
        sourceExternalId: String(job.id),
        ...(sourceUrl ? { sourceUrl } : {}),
        rawPayload: JSON.stringify({ ...job, _boardId: cleanId }),
        observedAt: new Date(),
      };
    }
  }
}
