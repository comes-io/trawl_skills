import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Build the script-VM context (TRAWL + account) from parsed CLI flags, mirroring
 * the worker runtime contract (#786): credentials are exposed BOTH under the
 * forward `TRAWL.account.*` sub-namespace AND the legacy bare `account` global
 * (a retained alias). `readFile` is injected so the builder stays pure/testable.
 * @param {Record<string, string|true>} flags - Parsed CLI flags.
 * @param {(path: string) => string} [readFile] - File reader (injected in tests).
 * @returns {{ TRAWL: object, account: object }}
 */
export function buildContext(flags, readFile = (p) => readFileSync(resolve(p), 'utf8')) {
  // A flag passed without `=value` parses to boolean `true` (see run-local.mjs's
  // parser). Coerce any non-string flag to null so a value-less flag can't leak a
  // boolean into the context (e.g. `TRAWL.account.username === true`) or crash
  // `readFile(true)`.
  const str = (v) => (typeof v === 'string' ? v : null);

  const TRAWL = { url: str(flags.url) };
  if (typeof flags.params === 'string') {
    for (const pair of flags.params.split(',')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx <= 0) continue;
      TRAWL[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
    }
  }

  const account = {
    username: str(flags['account-username']),
    password: str(flags['account-password']),
  };
  const cookiesPath = str(flags['account-cookies']);
  if (cookiesPath) {
    account.session = { cookies: JSON.parse(readFile(cookiesPath)) };
  }

  // Parity with the worker (trawl_node#786): also expose creds under TRAWL.account.*.
  // null when nothing was provided, mirroring buildTrawlAccount's null-when-empty contract.
  const hasAccount = !!(account.username || account.password || account.session);
  TRAWL.account = hasAccount ? account : null;

  return { TRAWL, account };
}
