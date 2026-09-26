import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load .env.local for CLI scripts.
 *
 * Next.js does this for the app, but a bare `tsx scripts/…` run does not — so
 * without it the documented sync command runs with no credentials and reports
 * a missing endpoint that is in fact configured.
 *
 * Real environment variables always win, which keeps CI secrets authoritative
 * over any file that happens to be on the runner.
 */
export function loadEnvLocal(cwd = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const name of ['.env.local', '.env']) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(separator + 1).trim();
      // Strip one matching pair of surrounding quotes.
      if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
      loaded.push(key);
    }
  }

  return loaded;
}
