import dns from 'dns';
import net from 'net';

/**
 * SSRF guard for provider-hosted result images.
 *
 * OpenRouter (and the models behind it) hand back image *links*. The main
 * process fetches them, so a hostile or compromised reply could point at the
 * local backend (127.0.0.1:8000), the LAN, a router admin page, or a cloud
 * metadata endpoint. Only `https:` to a public address is fetched:
 *   - the URL is checked up front (scheme, literal IPs, DNS answers);
 *   - `lookup` re-checks every address at connect time, so a DNS answer that
 *     changes between the check and the connection (rebinding) is refused;
 *   - `beforeRedirect` applies the same rules to every redirect hop.
 */

export class UnsafeRemoteUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRemoteUrlError';
  }
}

type LookupAddress = { address: string; family: number };
export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolveHost: ResolveHost = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Cidr(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(address) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_IPV4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function isPublicIpv4(address: string): boolean {
  return !BLOCKED_IPV4.some(([base, bits]) => inIpv4Cidr(address, base, bits));
}

/** Expand an IPv6 literal into eight 16-bit groups (null when malformed). */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0];
  let tail: number[] = [];
  // Embedded dotted IPv4 (::ffff:1.2.3.4, 64:ff9b::1.2.3.4).
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (net.isIPv4(dotted[2]) === false) return null;
    const value = ipv4ToInt(dotted[2]);
    tail = [value >>> 16, value & 0xffff];
    text = `${dotted[1]}0:0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...new Array(Math.max(fill, 0)).fill(0), ...rest];
  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group) || group < 0 || group > 0xffff)) {
    return null;
  }
  if (tail.length) {
    groups[6] = tail[0];
    groups[7] = tail[1];
  }
  return groups;
}

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embeddedV4 = `${g6 >>> 8}.${g6 & 0xff}.${g7 >>> 8}.${g7 & 0xff}`;

  if (groups.every((group) => group === 0)) return false; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return false; // ::1
  // IPv4-mapped / -compatible / NAT64: judge the embedded IPv4 address.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
    return isPublicIpv4(embeddedV4);
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicIpv4(embeddedV4);
  }
  if ((g0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  if (g0 === 0x2002) return isPublicIpv4(`${g1 >>> 8}.${g1 & 0xff}.${g2 >>> 8}.${g2 & 0xff}`); // 6to4
  if (g0 === 0x2001 && g1 === 0) return false; // Teredo
  return true;
}

/** True only for a globally routable unicast address. */
export function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function stripBrackets(hostname: string) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function assertHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeRemoteUrlError('the image link is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new UnsafeRemoteUrlError('the image link is not https');
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeRemoteUrlError('the image link carries credentials');
  }
  return parsed;
}

/**
 * Throw unless `rawUrl` is https and its host resolves only to public
 * addresses. Returns the parsed URL.
 */
export async function assertPublicHttpsUrl(rawUrl: string, resolveHost: ResolveHost = defaultResolveHost): Promise<URL> {
  const parsed = assertHttpsUrl(rawUrl);
  const host = stripBrackets(parsed.hostname);
  if (net.isIP(host)) {
    if (!isPublicIpAddress(host)) {
      throw new UnsafeRemoteUrlError('the image link points at a private or local address');
    }
    return parsed;
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new UnsafeRemoteUrlError('the image link points at a private or local address');
  }
  let addresses: LookupAddress[];
  try {
    addresses = await resolveHost(host);
  } catch {
    throw new UnsafeRemoteUrlError('the image host could not be resolved');
  }
  if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw new UnsafeRemoteUrlError('the image link points at a private or local address');
  }
  return parsed;
}

type ConnectAddress = { address: string; family: 4 | 6 };
type LookupCallback = (error: Error | null, addresses: ConnectAddress[]) => void;

/**
 * Connect-time DNS lookup for axios/http: resolves like dns.lookup but fails
 * the connection when any answer is not a public address.
 */
export function publicOnlyLookup(
  hostname: string,
  _options: object,
  callback: LookupCallback,
): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const list: ConnectAddress[] = addresses.map((entry) => ({
      address: entry.address,
      family: entry.family === 6 ? 6 : 4,
    }));
    if (list.length === 0 || list.some((entry) => !isPublicIpAddress(entry.address))) {
      const refused = new UnsafeRemoteUrlError('the image host resolved to a private or local address');
      (refused as NodeJS.ErrnoException).code = 'EADDRNOTAVAIL';
      callback(refused, []);
      return;
    }
    callback(null, list);
  });
}

/** follow-redirects hook (axios `beforeRedirect`): every hop must be https to a public literal or name. */
export function assertSafeRedirect(options: { protocol?: string; hostname?: string; host?: string }): void {
  if (options.protocol !== 'https:') {
    throw new UnsafeRemoteUrlError('the image link redirected away from https');
  }
  const host = stripBrackets(options.hostname ?? options.host ?? '');
  if (net.isIP(host) && !isPublicIpAddress(host)) {
    throw new UnsafeRemoteUrlError('the image link redirected to a private or local address');
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new UnsafeRemoteUrlError('the image link redirected to a private or local address');
  }
}
