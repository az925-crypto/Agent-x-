import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanTarget } from './scan/index';
import { sherlockSearch } from './sherlock/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root regardless of source (tools/) or bundle (root/) context
// Source: __dirname = .../tools/ → go up one level
// Bundle: __dirname = .../       → already at project root
const PROJECT_ROOT = path.basename(__dirname) === 'tools'
  ? path.resolve(__dirname, '..')
  : __dirname;

const PYTHON = 'python3';

type PythonProgressCb = (type: 'stdout' | 'stderr', chunk: string) => void;

function runPythonScript(scriptPath: string, args: string[], onProgress?: PythonProgressCb): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [scriptPath, ...args], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    const killer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Python script timed out after 600s: ${scriptPath}`));
    }, 600000);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onProgress) onProgress('stdout', chunk);
    });
    child.stdout.on('error', () => {});
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (onProgress) onProgress('stderr', chunk);
    });
    child.stderr.on('error', () => {});

    child.on('close', (code) => {
      clearTimeout(killer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        if (stdout) {
          try {
            const parsed = JSON.parse(stdout);
            if (parsed.success) {
              resolve(stdout.trim());
              return;
            }
            reject(new Error(parsed.error || 'Tool failed'));
            return;
          } catch { /* stdout not JSON, fall through */ }
        }
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(killer);
      reject(err);
    });
  });
}

export async function runIG(username: string, onProgress?: PythonProgressCb): Promise<Record<string, unknown>> {
  const scriptPath = path.join(PROJECT_ROOT, 'tools', 'ig', 'main.py');
  const output = await runPythonScript(scriptPath, [username], onProgress);
  return JSON.parse(output);
}

export async function runScan(target: string) {
  return scanTarget(target);
}

export async function runSherlock(
  username: string,
  onProgress?: (name: string, status: 'checking' | 'found' | 'not_found' | 'error') => void
) {
  return sherlockSearch(username, onProgress);
}

export async function runIGFollowers(username: string, onProgress?: PythonProgressCb): Promise<Record<string, unknown>> {
  const scriptPath = path.join(PROJECT_ROOT, 'tools', 'ig', 'ig_followers.py');
  const output = await runPythonScript(scriptPath, [username], onProgress);
  return JSON.parse(output);
}

export async function runIGFollowing(username: string, onProgress?: PythonProgressCb): Promise<Record<string, unknown>> {
  const scriptPath = path.join(PROJECT_ROOT, 'tools', 'ig', 'ig_following.py');
  const output = await runPythonScript(scriptPath, [username], onProgress);
  return JSON.parse(output);
}

export async function runIGMedia(username: string, amount = 5, onProgress?: PythonProgressCb): Promise<Record<string, unknown>> {
  const scriptPath = path.join(PROJECT_ROOT, 'tools', 'ig', 'ig_media.py');
  const output = await runPythonScript(scriptPath, [username, String(amount)], onProgress);
  return JSON.parse(output);
}

export async function runIGDownload(username: string, amount = 5, onProgress?: PythonProgressCb): Promise<Record<string, unknown>> {
  const scriptPath = path.join(PROJECT_ROOT, 'tools', 'ig', 'ig_download.py');
  const output = await runPythonScript(scriptPath, [username, String(amount)], onProgress);
  return JSON.parse(output);
}
