import { createApiAdapter } from './api';
import type { AuthStyle } from './api';

/**
 * Shiftly Auto inventory.
 *
 * Shiftly is the listing tool the inventory is already managed in, which makes
 * it the right source for this site: it is authorized, complete, and does not
 * break when a dealer website is redesigned.
 *
 * Their API is not publicly documented, so the request shape is configurable
 * rather than hard-coded. Set these and the adapter does the rest:
 *
 *   SHIFTLY_API_URL     the inventory endpoint, e.g. https://<host>/get-csv-file
 *   SHIFTLY_API_KEY     the credential (never commit this)
 *   SHIFTLY_AUTH_STYLE  query for Shiftly; bearer | header also supported
 *   SHIFTLY_AUTH_PARAM  query parameter name — api_key for Shiftly
 *   SHIFTLY_AUTH_HEADER header name, when SHIFTLY_AUTH_STYLE=header
 *   SHIFTLY_DEALER_ID   optional, sent as dealer_id when present
 *
 * The endpoint returns the full catalogue as one CSV export, which the shared
 * feed parser reads directly. Any fixed query parameters already on the URL are
 * preserved exactly, so the URL can be pasted in whole from the browser.
 *
 * Field names are matched loosely by the shared feed mapper, so most JSON
 * shapes land correctly without any mapping. Run
 * `npm run sync -- --source=shiftly --dry-run` to confirm before publishing.
 */

const AUTH_STYLES: AuthStyle[] = ['bearer', 'header', 'query', 'none'];

function authStyle(): AuthStyle {
  // Shiftly authenticates with ?api_key=…, so query is the right default here.
  const value = (process.env.SHIFTLY_AUTH_STYLE ?? 'query').toLowerCase() as AuthStyle;
  return AUTH_STYLES.includes(value) ? value : 'query';
}

export const shiftlyAdapter = createApiAdapter({
  name: 'shiftly',
  authStyle: authStyle(),
  headerName: process.env.SHIFTLY_AUTH_HEADER ?? 'X-API-Key',
  queryParam: process.env.SHIFTLY_AUTH_PARAM ?? 'api_key',
  params: process.env.SHIFTLY_DEALER_ID ? { dealer_id: process.env.SHIFTLY_DEALER_ID } : {},
  // Shiftly returns the whole catalogue as a single CSV export, so there is
  // nothing to paginate. Leaving pageSize unset keeps the adapter from asking
  // for a page 2 that does not exist.
  maxPages: 1,
  resolve: () => {
    const url = process.env.SHIFTLY_API_URL ?? '';
    const apiKey = process.env.SHIFTLY_API_KEY ?? '';
    if (!url) {
      throw new Error(
        'The "shiftly" adapter needs SHIFTLY_API_URL (the inventory endpoint). ' +
          'Set it in .env.local locally, or as a repository variable in CI.',
      );
    }
    if (!apiKey) {
      throw new Error(
        'The "shiftly" adapter needs SHIFTLY_API_KEY. ' +
          'Set it in .env.local locally, or as an Actions secret in CI — never commit it.',
      );
    }
    return { url, apiKey };
  },
});
