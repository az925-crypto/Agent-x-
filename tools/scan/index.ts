import dns from 'dns/promises';
import { isValidIP, fetchGeoIP, type GeoJSResponse } from '../../src/utils';

export interface ScanResult {
  target: string;
  resolvedIPs: string[];
  geoData: GeoJSResponse;
}

export async function scanTarget(target: string): Promise<{
  success: true; data: ScanResult; meta: { source: string; duration_ms: number }
} | {
  success: false; error: string; meta: { source: string; duration_ms: number }
}> {
  const start = Date.now();
  const source = 'scan/ts';

  try {
    let ipToScan = target;
    let dnsRecords: string[] = [];

    if (!isValidIP(target)) {
      try {
        const records = await dns.resolve4(target);
        dnsRecords = records;
        ipToScan = records[0] || '';
      } catch {
        ipToScan = '';
      }
    } else {
      dnsRecords = [target];
    }

    let geoData: GeoJSResponse = {};
    if (ipToScan) {
      geoData = await fetchGeoIP(ipToScan);
    }

    return {
      success: true,
      data: { target, resolvedIPs: dnsRecords, geoData },
      meta: { source, duration_ms: Date.now() - start }
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || 'Scan failed',
      meta: { source, duration_ms: Date.now() - start }
    };
  }
}
