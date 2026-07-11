import { describe, expect, it } from 'vitest';
import { formatBytes, formatEta, formatSpeed } from './formatUtils';

describe('formatBytes', () => {
  it('walks binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(4 * 1024 ** 2)).toBe('4.0 MB');
    expect(formatBytes(137_975_824_384)).toBe('128.5 GB');
  });
  it('zero and negatives read as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('formats bytes/second', () => {
    expect(formatSpeed(12.4 * 1024 ** 2)).toBe('12.4 MB/s');
  });
  it('empty when idle', () => {
    expect(formatSpeed(0)).toBe('');
  });
});

describe('formatEta', () => {
  it('minutes:seconds under an hour', () => {
    expect(formatEta(272)).toBe('4:32 left');
  });
  it('hours form at an hour and beyond', () => {
    expect(formatEta(4_320)).toBe('1h 12m left');
  });
  it('empty when unknown or non-positive', () => {
    expect(formatEta(null)).toBe('');
    expect(formatEta(0)).toBe('');
    expect(formatEta(Number.NaN)).toBe('');
  });
});
