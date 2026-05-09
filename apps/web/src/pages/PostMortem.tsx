import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

type EventKind =
  | 'event'
  | 'agent'
  | 'reply'
  | 'challenge'
  | 'defer'
  | 'draw'
  | 'consult'
  | 'test';

interface TimelineEvent {
  time: string;
  who: string;
  text: string;
  kind: EventKind;
  score?: string;
  scoreColor?: 'success' | 'danger';
}

const EVENTS: TimelineEvent[] = [
  { time: '00:30', who: 'start', text: 'naive double loop committed.', kind: 'event' },
  { time: '02:18', who: 'cost-guide', text: '"cost as n grows?"', kind: 'agent' },
  { time: '03:04', who: 'you · reply', text: '"hashmap, key by value."', kind: 'reply', score: '+1', scoreColor: 'success' },
  { time: '05:42', who: 'contrarian', text: '"what about duplicates?"', kind: 'agent' },
  { time: '06:11', who: 'you · ⚔ challenge', text: '"handled — read before insert."', kind: 'challenge', score: '+1', scoreColor: 'success' },
  { time: '08:30', who: 'pattern-seer', text: '"how does this differ from 3sum?"', kind: 'agent' },
  { time: '09:14', who: 'you · ⏸ defer', text: '"what about duplicates?" — deferred · answered 12:34 ↓', kind: 'defer' },
  { time: '10:22', who: 'you · ✎ draw', text: 'sent diagram to cost-guide + pattern-seer.', kind: 'draw' },
  { time: '11:45', who: 'you · ☎ consult', text: 'consultor: walked through the loop.', kind: 'consult' },
  { time: '12:34', who: 'you · reply', text: '"i see — read before write protects the first index."', kind: 'reply', score: '+1', scoreColor: 'success' },
  { time: '14:08', who: 'tests', text: '✗ duplicates  →  fixed at 17:55', kind: 'test', score: '−1', scoreColor: 'danger' },
  { time: '17:55', who: 'you · reply', text: 'committed to the hashmap.', kind: 'reply', score: '+1', scoreColor: 'success' },
  { time: '18:00', who: 'tests', text: '✓ all passed.', kind: 'test', score: '+1', scoreColor: 'success' },
];

const SELECTED_INDEX = 8;

const KIND_COLOR: Record<EventKind, string> = {
  event: 'var(--color-dim)',
  agent: 'var(--color-dim)',
  reply: 'var(--color-success)',
  challenge: 'var(--color-success)',
  defer: 'var(--color-ash)',
  draw: 'var(--color-bone)',
  consult: 'var(--color-warn)',
  test: 'var(--color-bone)',
};

const SCORE_BAR = [1, 1, -1, 1, 1, 1, -1, 1, 1, 1, 1, 1];

export function PostMortemPage() {
  return (
    <PageFrame>
      <TopBar
        title={
          <span>
            <span style={{ color: 'var(--color-dim)' }}>#142</span> two sum
            <span style={{ color: 'var(--color-dim)' }}> · 18m · solved</span>
          </span>
        }
        right="archived · today · export · share"
        tabs={[
          { label: 'transcript', active: true },
          { label: 'patterns' },
          { label: 'reviewer' },
          { label: 'replay (autoplay)' },
        ]}
      />

      {/* Score bar — sentiment, not brand */}
      <div
        style={{
          padding: '12px 36px',
          borderBottom: '1px solid var(--color-hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-dim)',
            }}
          >
            session score
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 28,
              color: 'var(--color-success)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            +4
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {SCORE_BAR.map((s, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 14,
                background: s > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                opacity: 0.85,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 22, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {[
            ['actively learnt', '+3', 'success'],
            ['challenges', '+2', 'success'],
            ['consults', '−1', 'danger'],
          ].map(([label, value, sentiment]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  color: 'var(--color-dim)',
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
              <span style={{ color: `var(--color-${sentiment})` }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        {/* timeline */}
        <div
          style={{
            flex: 1,
            padding: '20px 36px 32px',
            display: 'flex',
            gap: 20,
          }}
        >
          <div style={{ position: 'relative', width: 14, flex: '0 0 auto' }}>
            <div
              style={{
                position: 'absolute',
                top: 6,
                bottom: 6,
                left: 6,
                width: 1,
                background: 'var(--color-hairline)',
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {EVENTS.map((e, i) => {
              const c = KIND_COLOR[e.kind];
              const selected = i === SELECTED_INDEX;
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: '76px 1fr 60px',
                    gap: 18,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--color-hairline)',
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -34,
                      top: 16,
                      width: 9,
                      height: 9,
                      background: c,
                      boxShadow: selected
                        ? '0 0 0 2px var(--color-bg), 0 0 0 3px var(--color-accent)'
                        : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--color-dim)',
                      paddingTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {e.time}
                  </span>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: c,
                        marginBottom: 4,
                      }}
                    >
                      {e.who}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: 'var(--color-bone)',
                        fontStyle:
                          e.kind === 'defer' || e.kind === 'draw' || e.kind === 'consult'
                            ? 'italic'
                            : 'normal',
                      }}
                    >
                      {e.text}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: e.scoreColor
                        ? `var(--color-${e.scoreColor})`
                        : 'var(--color-dim)',
                      textAlign: 'right',
                    }}
                  >
                    {e.score ?? ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* right rail */}
        <aside
          style={{
            width: 380,
            borderLeft: '1px solid var(--color-hairline)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '14px 22px',
              borderBottom: '1px solid var(--color-hairline)',
            }}
          >
            <Eyebrow>at 11:45</Eyebrow>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-ash)',
              }}
            >
              consultor session · 49s
            </div>
          </div>

          <div
            style={{
              flex: 1,
              padding: '14px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <Eyebrow tight>responding to</Eyebrow>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                contrarian: "what if the same number appears twice?"
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--color-hairline)' }} />
            <div>
              <Eyebrow tight color="var(--color-warn)">
                consultor
              </Eyebrow>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                walk me through your loop. when do you write to the map vs. read from it?
              </div>
            </div>
            <div>
              <Eyebrow tight>you</Eyebrow>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                read first, then write. so the second 3 looks up complement before overwriting.
              </div>
            </div>
          </div>

          {/* reviewer's note — strongest typography */}
          <div
            style={{
              borderTop: '2px solid var(--color-bone)',
              padding: '18px 22px',
              background: 'var(--color-panel)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: 'var(--color-bone)',
                marginBottom: 10,
                fontWeight: 600,
              }}
            >
              reviewer's note
            </div>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                fontWeight: 500,
                letterSpacing: '-0.005em',
                margin: 0,
              }}
            >
              the consult was a small concession that produced a clean reply 49 seconds later. a
              better drill is to start with the contrarian's question before writing.
            </p>
            <div
              style={{
                marginTop: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-accent)',
              }}
            >
              start drill →
            </div>
          </div>
        </aside>
      </div>

      <StatusBar />
    </PageFrame>
  );
}

function Eyebrow({
  children,
  tight,
  color,
}: {
  children: React.ReactNode;
  tight?: boolean;
  color?: string;
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: tight ? 9.5 : 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: color || 'var(--color-dim)',
        marginBottom: tight ? 4 : 6,
      }}
    >
      {children}
    </div>
  );
}
