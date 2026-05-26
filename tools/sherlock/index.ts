import { checkReddit, checkGitHub } from '../../src/utils';

interface PlatformResult {
  name: string;
  found: boolean;
  label: string;
}

const PLATFORMS: Array<{
  name: string;
  label: string;
  check: (username: string, signal: AbortSignal) => Promise<boolean>;
}> = [
  { name: 'GitHub', label: 'KONFIRMASI AKTIF', check: checkGitHub },
  {
    name: 'GitLab', label: 'KONFIRMASI AKTIF',
    check: async (username, signal) => {
      const res = await fetch(`https://gitlab.com/api/v4/users?username=${username}`, { signal });
      if (res.status === 200) {
        const data = await res.json();
        return Array.isArray(data) && data.length > 0 && data[0].username === username;
      }
      return false;
    }
  },
  {
    name: 'Reddit', label: 'KONFIRMASI AKTIF', check: checkReddit
  },
  {
    name: 'TikTok', label: 'KEMUNGKINAN AKTIF',
    check: async (username, signal) => {
      const res = await fetch(`https://www.tiktok.com/@${username}`, { redirect: 'follow', signal });
      const text = await res.text();
      return res.status === 200 && !text.includes('This page could not be found') && text.includes('@' + username);
    }
  },
  {
    name: 'Medium', label: 'KEMUNGKINAN AKTIF',
    check: async (username, signal) => {
      const res = await fetch(`https://medium.com/@${username}`, { signal });
      const text = await res.text();
      return res.status === 200 && !text.includes('Page Not Found') && text.includes('@' + username);
    }
  },
  {
    name: 'Vimeo', label: 'KEMUNGKINAN AKTIF',
    check: async (username, signal) => {
      const res = await fetch(`https://vimeo.com/${username}`, { signal });
      const text = await res.text();
      return res.status === 200 && !text.includes('Page Not Found') && !res.url.includes('/search');
    }
  },
  {
    name: 'VK', label: 'KEMUNGKINAN AKTIF',
    check: async (username, signal) => {
      const res = await fetch(`https://vk.com/${username}`, { signal });
      return res.status === 200;
    }
  },
];

export async function sherlockSearch(
  username: string,
  onProgress?: (name: string, status: 'checking' | 'found' | 'not_found' | 'error') => void
): Promise<{
  success: true; data: { username: string; foundPlatforms: string[] }; meta: { source: string; duration_ms: number }
} | {
  success: false; error: string; meta: { source: string; duration_ms: number }
}> {
  const start = Date.now();
  const source = 'sherlock/ts';

  try {
    const foundPlatforms: string[] = [];

    for (const platform of PLATFORMS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      if (onProgress) onProgress(platform.name, 'checking');
      try {
        const isFound = await platform.check(username, controller.signal);
        if (isFound) {
          foundPlatforms.push(`${platform.name} (${platform.label})`);
          if (onProgress) onProgress(platform.name, 'found');
        } else {
          if (onProgress) onProgress(platform.name, 'not_found');
        }
      } catch {
        if (onProgress) onProgress(platform.name, 'error');
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return {
      success: true,
      data: { username, foundPlatforms },
      meta: { source, duration_ms: Date.now() - start }
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || 'Sherlock search failed',
      meta: { source, duration_ms: Date.now() - start }
    };
  }
}
