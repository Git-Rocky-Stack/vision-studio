import { describe, expect, it } from 'vitest';

import { assertPublicHttpsUrl, assertSafeRedirect, isPublicIpAddress } from './remoteFetchGuard';

const publicHost = async () => [{ address: '93.184.216.34', family: 4 }];

describe('isPublicIpAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.0.9',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '100.127.255.255',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a00:1',
    '2002:c0a8:0101::1',
    'ff02::1',
  ])('refuses %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );
});

describe('assertPublicHttpsUrl (S10)', () => {
  it('allows https to a host that resolves publicly', async () => {
    await expect(assertPublicHttpsUrl('https://cdn.example.com/a.png', publicHost)).resolves.toBeInstanceOf(URL);
  });

  it.each([
    'http://cdn.example.com/a.png',
    'file:///etc/passwd',
    'https://127.0.0.1:8000/api/jobs',
    'https://[::1]/x',
    'https://[::ffff:127.0.0.1]/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/x',
    'https://user:pw@cdn.example.com/a.png',
    'not a url',
  ])('refuses %s', async (url) => {
    await expect(assertPublicHttpsUrl(url, publicHost)).rejects.toThrow();
  });

  it('refuses a name that resolves to a private address (DNS-based SSRF)', async () => {
    const rebinding = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    await expect(assertPublicHttpsUrl('https://evil.example/a.png', rebinding)).rejects.toThrow(/private or local/);
    await expect(assertPublicHttpsUrl('https://evil.example/a.png', async () => [])).rejects.toThrow();
    await expect(
      assertPublicHttpsUrl('https://evil.example/a.png', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).rejects.toThrow(/could not be resolved/);
  });
});

describe('assertSafeRedirect', () => {
  it('refuses redirects off https or to private literals', () => {
    expect(() => assertSafeRedirect({ protocol: 'http:', hostname: 'cdn.example.com' })).toThrow();
    expect(() => assertSafeRedirect({ protocol: 'https:', hostname: '127.0.0.1' })).toThrow();
    expect(() => assertSafeRedirect({ protocol: 'https:', hostname: '[::1]' })).toThrow();
    expect(() => assertSafeRedirect({ protocol: 'https:', hostname: 'localhost' })).toThrow();
    expect(() => assertSafeRedirect({ protocol: 'https:', hostname: 'cdn.example.com' })).not.toThrow();
  });
});
