import { isRecord } from '../lib/type-guards.ts';
import { fail } from './failure.ts';
import { isWebUrl } from './register.ts';
import type { IndexPrototypesResult, ProbedTarget } from './types.ts';

/** How long a page target has to answer the probe before it counts as hung. */
export const PROBE_TIMEOUT_MS = 5000;

const DEFAULT_DEPS: ProbeDeps = { fetch, evaluate: evaluateOverWebSocket };

/**
 * Probes every page target of the browser at `endpoint` with a trivial `Runtime.evaluate`, closes each one that does
 * not answer within the timeout, and reports both sets.
 */
export async function probeTargets(endpoint: string, deps: ProbeDeps = DEFAULT_DEPS): Promise<IndexPrototypesResult> {
  if (!isWebUrl(endpoint)) {
    return fail('invalid-url', `--endpoint "${endpoint}" is not an http or https URL`);
  }
  const base = endpoint.replace(/\/+$/, '');

  let listed: unknown;
  try {
    const response = await deps.fetch(`${base}/json/list`);
    listed = await response.json();
  } catch {
    return fail('endpoint-unreachable', `${base}/json/list did not return a target list`);
  }
  const targets = parsePageTargets(listed);

  const outcomes = await Promise.all(
    targets.map(async (target) => ({ target, answered: await deps.evaluate(target.webSocketUrl, PROBE_TIMEOUT_MS) })),
  );
  const answered: ProbedTarget[] = [];
  const closed: ProbedTarget[] = [];
  for (const { target, answered: didAnswer } of outcomes) {
    const probed = { id: target.id, url: target.url };
    if (didAnswer) {
      answered.push(probed);
      continue;
    }
    try {
      await deps.fetch(`${base}/json/close/${encodeURIComponent(target.id)}`);
    } catch {
      return fail('endpoint-unreachable', `${base}/json/close/${target.id} did not answer`);
    }
    closed.push(probed);
  }
  return { ok: true, command: 'probe-targets', closed, answered };
}

/**
 * Resolves true when the target behind `webSocketUrl` answers a `Runtime.evaluate` of `1` within `timeoutMs`, and false
 * when it does not answer, the connection fails, or the reply is an error.
 *
 * @internal - Exported to allow testing.
 */
export async function evaluateOverWebSocket(
  webSocketUrl: string,
  timeoutMs: number,
  createSocket: (url: string) => ProbeSocket = (url) => new WebSocket(url),
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket(webSocketUrl);
    const timer = setTimeout(() => settle(false), timeoutMs);

    function settle(answered: boolean): void {
      clearTimeout(timer);
      socket.close();
      resolve(answered);
    }

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1' } }));
    });
    socket.addEventListener('message', (event) => {
      const reply = parseReply(event);
      if (reply !== undefined && reply.id === 1) {
        settle(!reply.isError);
      }
    });
    socket.addEventListener('error', () => settle(false));
  });
}

/** The I/O that `probeTargets` performs, injectable for tests. */
export interface ProbeDeps {
  fetch: (url: string) => Promise<{ json(): Promise<unknown> }>;
  evaluate: (webSocketUrl: string, timeoutMs: number) => Promise<boolean>;
}

/** The part of a WebSocket that the probe uses. */
export interface ProbeSocket {
  addEventListener(type: 'error' | 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
  send(data: string): void;
}

// region | Helpers

/** Returns the page targets of a DevTools `/json/list` response, skipping entries without an id or a socket URL. */
function parsePageTargets(value: unknown): Array<{ id: string; url: string; webSocketUrl: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const targets: Array<{ id: string; url: string; webSocketUrl: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || item['type'] !== 'page') {
      continue;
    }
    const { id, url, webSocketDebuggerUrl } = item;
    if (typeof id === 'string' && typeof webSocketDebuggerUrl === 'string') {
      targets.push({ id, url: typeof url === 'string' ? url : '', webSocketUrl: webSocketDebuggerUrl });
    }
  }
  return targets;
}

/** Returns a CDP reply's id and whether it is an error, or undefined for a message that is not a reply. */
function parseReply(event: { data: unknown }): { id: unknown; isError: boolean } | undefined {
  if (typeof event.data !== 'string') {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  return { id: parsed['id'], isError: parsed['error'] !== undefined };
}

// endregion | Helpers
