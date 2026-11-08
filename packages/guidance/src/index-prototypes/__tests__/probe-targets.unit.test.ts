import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateOverWebSocket,
  PROBE_TIMEOUT_MS,
  type ProbeDeps,
  type ProbeSocket,
  probeTargets,
} from '../probe-targets.ts';

const ENDPOINT = 'http://127.0.0.1:20119';

const TARGETS = [
  { id: 'A', type: 'page', url: 'http://127.0.0.1:8000/fine-v1.html', webSocketDebuggerUrl: 'ws://a' },
  { id: 'B', type: 'page', url: 'http://127.0.0.1:8000/hung-v1.html', webSocketDebuggerUrl: 'ws://b' },
  { id: 'C', type: 'service_worker', url: 'http://127.0.0.1:8000/sw.js', webSocketDebuggerUrl: 'ws://c' },
];

describe(probeTargets, () => {
  it('closes each page target that does not answer and reports the ones that did', async () => {
    const { deps, fetched } = makeDeps({ list: TARGETS, answering: new Set(['ws://a']) });

    await expect(probeTargets(`${ENDPOINT}/`, deps)).resolves.toEqual({
      ok: true,
      command: 'probe-targets',
      closed: [{ id: 'B', url: 'http://127.0.0.1:8000/hung-v1.html' }],
      answered: [{ id: 'A', url: 'http://127.0.0.1:8000/fine-v1.html' }],
    });
    expect(fetched).toEqual([`${ENDPOINT}/json/list`, `${ENDPOINT}/json/close/B`]);
  });

  it('returns endpoint-unreachable when the target list cannot be read', async () => {
    const deps: ProbeDeps = {
      fetch: () => Promise.reject(new Error('connect ECONNREFUSED')),
      evaluate: () => Promise.resolve(true),
    };

    await expect(probeTargets(ENDPOINT, deps)).resolves.toMatchObject({ ok: false, error: 'endpoint-unreachable' });
  });

  it('returns invalid-url for an endpoint that is not http or https', async () => {
    const { deps } = makeDeps({ list: [], answering: new Set() });

    await expect(probeTargets('ws://127.0.0.1:20119', deps)).resolves.toMatchObject({
      ok: false,
      error: 'invalid-url',
    });
  });
});

describe(evaluateOverWebSocket, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true when the target replies to the probe', async () => {
    const socket = new FakeSocket();
    const answered = evaluateOverWebSocket('ws://a', PROBE_TIMEOUT_MS, () => socket);

    socket.emit('open');
    socket.emit('message', { data: JSON.stringify({ id: 1, result: { result: { type: 'number', value: 1 } } }) });

    await expect(answered).resolves.toBe(true);
    expect(socket.sent).toEqual([JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1' } })]);
    expect(socket.closed).toBe(true);
  });

  it('resolves false when the target does not reply within the timeout', async () => {
    const socket = new FakeSocket();
    const answered = evaluateOverWebSocket('ws://b', PROBE_TIMEOUT_MS, () => socket);

    socket.emit('open');
    vi.advanceTimersByTime(PROBE_TIMEOUT_MS);

    await expect(answered).resolves.toBe(false);
    expect(socket.closed).toBe(true);
  });

  it('resolves false when the connection fails', async () => {
    const socket = new FakeSocket();
    const answered = evaluateOverWebSocket('ws://b', PROBE_TIMEOUT_MS, () => socket);

    socket.emit('error');

    await expect(answered).resolves.toBe(false);
  });
});

// region | Helpers

/** A WebSocket stand-in whose events the test emits. */
class FakeSocket implements ProbeSocket {
  readonly sent: string[] = [];
  closed = false;
  private readonly listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event?: { data: unknown }): void {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event ?? { data: undefined });
    }
  }

  send(data: string): void {
    this.sent.push(data);
  }
}

/** Builds deps that serve `list` from `/json/list` and answer the probe for the socket URLs in `answering`. */
function makeDeps(input: { list: unknown; answering: ReadonlySet<string> }): { deps: ProbeDeps; fetched: string[] } {
  const fetched: string[] = [];
  const deps: ProbeDeps = {
    fetch: (url) => {
      fetched.push(url);
      return Promise.resolve({
        json: () => Promise.resolve(url.endsWith('/json/list') ? input.list : 'Target is closing'),
      });
    },
    evaluate: (webSocketUrl) => Promise.resolve(input.answering.has(webSocketUrl)),
  };
  return { deps, fetched };
}

// endregion | Helpers
