import { useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { ProblemStrip } from '../components/ProblemStrip';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';
import { PROBLEM } from '../lib/mockSession';

type ConnState = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

interface Turn {
  who: 'agent' | 'you' | 'system';
  text: string;
  streaming?: boolean;
}

const DEFAULT_WS = (import.meta.env.VITE_PI_WS as string | undefined) ?? '';

/**
 * Test-demo · single pane harness for live-testing pi-agent-core while it's
 * being built. Same chrome as Active page (TopBar / ProblemStrip / StatusBar)
 * but one full-width pane and a real WS-driven streaming reducer.
 *
 * Wire-format expected from the WS endpoint (matches design/api-contract.md
 * §5 server→client events, narrowed to the agent.message.* triplet):
 *
 *   { "type": "agent.message.start", "id": "msg_..." }
 *   { "type": "agent.message.token", "id": "msg_...", "delta": "..." }
 *   { "type": "agent.message.end",   "id": "msg_..." }
 *
 * If no endpoint is configured (VITE_PI_WS empty), the harness echoes the
 * user message back token-by-token after a short delay so the UI plumbing
 * can be exercised without a live backend.
 */
export function TestDemoPage() {
  const [endpoint, setEndpoint] = useState(DEFAULT_WS);
  const [conn, setConn] = useState<ConnState>('idle');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([
    {
      who: 'system',
      text: 'Test harness · single-pane. Type a message; SEND ⏎ to dispatch. Configure an endpoint above to talk to a live pi-agent-core; otherwise the harness mock-echoes.',
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  // Manage WS lifecycle.
  useEffect(() => {
    if (!endpoint) {
      wsRef.current?.close();
      wsRef.current = null;
      setConn('idle');
      return;
    }
    setConn('connecting');
    let alive = true;
    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint);
    } catch {
      setConn('error');
      return;
    }
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      if (!alive) return;
      setConn('open');
      pushTurn({ who: 'system', text: `connected to ${endpoint}` });
    });
    ws.addEventListener('error', () => {
      if (!alive) return;
      setConn('error');
    });
    ws.addEventListener('close', () => {
      if (!alive) return;
      setConn('closed');
    });
    ws.addEventListener('message', (ev) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(ev.data);
        handleServerEvent(msg);
      } catch {
        pushTurn({ who: 'system', text: `non-json frame: ${String(ev.data).slice(0, 80)}` });
      }
    });

    return () => {
      alive = false;
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const pushTurn = (t: Turn) => setTurns((prev) => [...prev, t]);

  const appendToken = (delta: string) => {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.who === 'agent' && last.streaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + delta },
        ];
      }
      return [...prev, { who: 'agent', text: delta, streaming: true }];
    });
  };

  const finishStream = () => {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
    streamingIdRef.current = null;
  };

  const handleServerEvent = (msg: { type?: string; id?: string; delta?: string }) => {
    switch (msg.type) {
      case 'agent.message.start':
        streamingIdRef.current = msg.id ?? 'unknown';
        pushTurn({ who: 'agent', text: '', streaming: true });
        break;
      case 'agent.message.token':
        if (msg.delta) appendToken(msg.delta);
        break;
      case 'agent.message.end':
        finishStream();
        break;
      default:
        // ignore other event types in the harness
        break;
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    pushTurn({ who: 'you', text });
    setDraft('');

    if (wsRef.current && conn === 'open') {
      wsRef.current.send(
        JSON.stringify({ op: 'reply.send', text, to_slots: [], mode: 'reply' }),
      );
      return;
    }

    // mock echo path
    void mockEcho(text, (delta) => appendToken(delta), () => finishStream());
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <PageFrame>
      <TopBar title="test-demo · single agent" right={`◐ ${conn}`} />

      <ProblemStrip
        title={PROBLEM.title}
        difficulty={PROBLEM.difficulty}
        tags={PROBLEM.tags}
      />

      {/* endpoint config strip */}
      <div
        style={{
          padding: '10px 36px',
          borderBottom: '1px solid var(--color-hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}
      >
        <span
          style={{
            color: 'var(--color-dim)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: 10,
          }}
        >
          ws endpoint
        </span>
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="ws://127.0.0.1:8787/v1/test"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid var(--color-hairline2)',
            borderRadius: 2,
            padding: '4px 8px',
            color: 'var(--color-bone)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        />
        <ConnPill state={conn} />
      </div>

      {/* single pane — full width */}
      <div
        style={{
          flex: 1,
          minHeight: 360,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 36px',
          gap: 18,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-dim)',
          }}
        >
          @1 · pi-agent-core
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {turns.map((t, i) => (
            <Turn key={i} turn={t} />
          ))}
        </div>
      </div>

      {/* unified-style input — single primary CTA */}
      <div
        style={{
          borderTop: '1px solid var(--color-hairline)',
          background: 'var(--color-panel)',
          padding: '14px 36px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 16px',
            border: '1px solid var(--color-accent-border)',
            background: 'var(--color-bg)',
            boxShadow: 'inset 0 0 0 1px var(--color-accent-soft)',
          }}
        >
          <span
            style={{
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              lineHeight: 1.6,
            }}
          >
            ▸
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            placeholder="ask the agent something. ⏎ to send, shift+⏎ for newline."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--color-bone)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              lineHeight: 1.55,
            }}
          />
          <button
            type="button"
            onClick={sendMessage}
            style={{
              alignSelf: 'flex-end',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-accent)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            send ⏎
          </button>
        </div>
      </div>

      <StatusBar
        connection={conn === 'open' ? 'connected' : conn === 'connecting' ? 'reconnecting' : 'disconnected'}
        file="(test harness)"
        snapshot={endpoint ? '@live' : '@mock'}
        model="pi-agent-core"
      />
    </PageFrame>
  );
}

function Turn({ turn }: { turn: Turn }) {
  const labelColor =
    turn.who === 'agent'
      ? 'var(--color-accent)'
      : turn.who === 'system'
        ? 'var(--color-warn)'
        : 'var(--color-dim)';

  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: labelColor,
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {turn.who}
        {turn.streaming && (
          <span
            aria-hidden
            className="throb"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: 'var(--color-accent)',
              borderRadius: 2,
            }}
          />
        )}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: turn.who === 'system' ? 'var(--color-ash)' : 'var(--color-bone)',
          fontStyle: turn.who === 'system' ? 'italic' : 'normal',
          whiteSpace: 'pre-wrap',
        }}
      >
        {turn.text || (turn.streaming ? '…' : '')}
      </div>
    </div>
  );
}

function ConnPill({ state }: { state: ConnState }) {
  const color =
    state === 'open'
      ? 'var(--color-success)'
      : state === 'connecting'
        ? 'var(--color-warn)'
        : state === 'error' || state === 'closed'
          ? 'var(--color-danger)'
          : 'var(--color-dim)';
  return (
    <span
      style={{
        color,
        padding: '2px 8px',
        border: `1px solid ${color}`,
        borderRadius: 2,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      {state}
    </span>
  );
}

async function mockEcho(text: string, onToken: (s: string) => void, onEnd: () => void) {
  const reply = `(mock echo) heard ${text.length} chars · "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`;
  await new Promise((r) => setTimeout(r, 160));
  for (const ch of reply) {
    onToken(ch);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 14));
  }
  onEnd();
}
