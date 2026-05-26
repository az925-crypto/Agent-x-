export interface GeoJSResponse {
  ip?: string;
  city?: string;
  country?: string;
  organization_name?: string;
  organization?: string;
  asn?: string;
}

const VALID_TYPES = ['IP', 'DOMAIN', 'USERNAME', 'EMAIL', 'ip', 'domain', 'username', 'email'];

export function validateTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const t = target as Record<string, unknown>;
  if (typeof t.value !== 'string' || typeof t.type !== 'string' || t.value.trim() === '') {
    return false;
  }
  if (!VALID_TYPES.includes(t.type)) {
    return false;
  }
  return true;
}

const IP_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const GEO_USER_AGENT = 'OSINT-Agent-X/1.0';

export async function fetchGeoIP(ip: string): Promise<GeoJSResponse> {
  // Try GeoJS.io first
  try {
    const res = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`, {
      headers: { 'User-Agent': GEO_USER_AGENT }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ip) return data;
    }
  } catch (err) { console.warn('[GeoIP] Primary failed:', err); }
  
  // Fallback: ip-api.com (free, 45 req/min, no key needed)
  console.warn('[GeoIP] Primary GeoJS.io failed, falling back to ip-api.com (HTTP)');
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,org,as,query`, {
      headers: { 'User-Agent': GEO_USER_AGENT }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        return {
          ip: data.query,
          city: data.city,
          country: data.country,
          organization_name: data.org,
          organization: data.org,
          asn: data.as
        };
      }
    }
  } catch (err) { console.warn('[GeoIP] Fallback failed:', err); }
  
  return {};
}

export async function checkReddit(username: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`https://old.reddit.com/user/${username}/about.json`, {
      signal,
      headers: { 'User-Agent': 'OSINT-Agent-X/1.0 (by /u/agent_x)' }
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function checkGitHub(username: string, signal: AbortSignal): Promise<boolean> {
  const headers: Record<string, string> = { 'User-Agent': 'OSINT-Agent-X/1.0' };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, { signal, headers });
    return res.status === 200;
  } catch {
    return false;
  }
}

export function isValidIP(ip: string): boolean {
  const match = ip.match(IP_REGEX);
  if (!match) return false;
  return match.slice(1).every(octet => parseInt(octet, 10) <= 255);
}

export async function resolveTargetData(
  targetType: string,
  targetValue: string,
  dnsResolver: (domain: string) => Promise<string[]>,
  mxResolver: (domain: string) => Promise<string[]>,
  geoFetcher: (ip: string) => Promise<GeoJSResponse>
): Promise<{ resolvedIPs: string[]; geoData: GeoJSResponse }> {
  let resolvedIPs: string[] = [];
  let geoData: GeoJSResponse = {};
  let ipToScan = targetValue;
  const type = targetType.toUpperCase();

  if (type === 'EMAIL') {
    const parts = targetValue.split('@');
    if (parts.length === 2) {
      ipToScan = parts[1];
    }
  } else if (type === 'USERNAME') {
    ipToScan = '';
  }

  if (ipToScan && !isValidIP(ipToScan)) {
    try {
      if (type === 'EMAIL') {
        resolvedIPs = await mxResolver(ipToScan);
      } else {
        resolvedIPs = await dnsResolver(ipToScan);
        if (resolvedIPs.length > 0) {
          ipToScan = resolvedIPs[0];
        } else {
          ipToScan = '';
        }
      }
    } catch (e) {
      console.error(`DNS resolution failed for ${ipToScan}:`, (e as Error).message);
      ipToScan = '';
    }
  } else if (ipToScan) {
    resolvedIPs = [ipToScan];
  }

  // GeoIP Lookup (skip for EMAIL and USERNAME)
  if (ipToScan && type !== 'EMAIL' && type !== 'USERNAME') {
    try {
      geoData = await geoFetcher(ipToScan);
    } catch (e) {
      console.error(`GeoIP lookup failed for ${ipToScan}:`, (e as Error).message);
    }
  }

  return { resolvedIPs, geoData };
}
