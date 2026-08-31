import { describe, expect, it } from 'vitest';

import { isSafeHttpUrl } from './url.js';

describe('isSafeHttpUrl', () => {
  it('accepts valid http and https URLs', () => {
    expect(isSafeHttpUrl('https://careers.stripe.com/jobs/123')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects unsafe protocols and malformed strings', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    );
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('//stripe.com')).toBe(false);
    expect(isSafeHttpUrl('not-a-url')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});
