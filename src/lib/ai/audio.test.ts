import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { estimateAudioDurationMs, oggOpusDurationMs } from './audio';

function oggPage(granule: number): Uint8Array {
  const page = new Uint8Array(27);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  let remaining = granule;
  for (let index = 0; index < 8; index += 1) {
    page[6 + index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  page[26] = 0;
  return page;
}

describe('WhatsApp audio duration', () => {
  it('reads the Ogg/Opus 48 kHz granule clock', () => {
    const tenSeconds = oggPage(48_000 * 10);
    expect(oggOpusDurationMs(tenSeconds)).toBe(10_000);
    expect(estimateAudioDurationMs(tenSeconds)).toBe(10_000);
  });

  it('prefers a duration supplied by the WhatsApp QR bridge', () => {
    expect(estimateAudioDurationMs(new Uint8Array([1, 2]), 12_345)).toBe(
      12_345
    );
  });
});
