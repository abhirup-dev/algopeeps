import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

const PAUSED_PANES: Array<[string, string]> = [
  ['cost-guide', 'paused while you consult.'],
  ['contrarian', 'what about duplicates?'],
  ['pattern-seer', 'compare 3sum.'],
];

const EXCHANGE: Array<['consultor' | 'you', string]> = [
  ['consultor', 'walk me through your loop. when do you write to the map vs. read from it?'],
  ['you', 'read first, then write. so the second 3 looks up complement before overwriting.'],
  ['consultor', 'right. now phrase that as a one-line answer for the contrarian.'],
];

export function ConsultorPage() {
  return (
    <PageFrame>
      <TopBar title="session" right="⏱ 15:08" />

      <div
        style={{
          padding: '14px 36px',
          borderBottom: '1px solid var(--color-hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 500 }}>Two Sum</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-ash)',
          }}
        >
          medium
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-ash)',
            padding: '2px 8px',
            border: '1px solid var(--color-hairline2)',
          }}
        >
          ? expand
        </span>
      </div>

      <div
        style={{
          padding: '12px 36px',
          borderBottom: '1px solid var(--color-hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}
      >
        <span
          style={{
            color: 'var(--color-dim)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontSize: 10,
          }}
        >
          council
        </span>
        <span style={{ color: 'var(--color-faint)' }}>① cost-guide ⏸ paused</span>
        <span style={{ color: 'var(--color-faint)' }}>② contrarian ⏸ paused</span>
        <span style={{ color: 'var(--color-faint)' }}>③ pattern-seer ⏸ paused</span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>☎</span>
          <span>consultor active</span>
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ flex: 1, display: 'flex', opacity: 0.34 }}>
          {PAUSED_PANES.map((p, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                borderRight: i < 2 ? '1px solid var(--color-hairline)' : 'none',
                padding: `14px ${i === 2 ? 36 : 18}px 14px ${i === 0 ? 36 : 18}px`,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                @{i + 1} {p[0]}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-ash)' }}>{p[1]}</div>
            </div>
          ))}
        </div>

        <aside
          style={{
            width: 480,
            borderLeft: '1px solid var(--color-accent-border)',
            background: 'var(--color-accent-soft)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--color-hairline)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 16,
                  color: 'var(--color-accent)',
                }}
              >
                ☎
              </span>
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
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                }}
              >
                consultor · helpline
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-ash)',
                lineHeight: 1.5,
              }}
            >
              ask anything; surfaced in post-mortem.
            </div>
          </div>

          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--color-hairline)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-dim)',
            }}
          >
            <span style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              helping you answer{' '}
            </span>
            <span style={{ color: 'var(--color-ash)' }}>· @2 contrarian</span>
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--color-bone)',
                lineHeight: 1.5,
              }}
            >
              "what if the same number appears twice? your map will overwrite the first index."
            </div>
          </div>

          <div
            style={{
              flex: 1,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {EXCHANGE.map(([who, text], i) => (
              <div key={i}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: who === 'consultor' ? 'var(--color-accent)' : 'var(--color-dim)',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {who === 'consultor' && <span style={{ fontSize: 12 }}>☎</span>}
                  <span>{who}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{text}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: '1px solid var(--color-hairline)',
              padding: '12px 18px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-dim)',
                marginBottom: 6,
              }}
            >
              consultor input · returns to council on close
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--color-accent)' }}>▸</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--color-ash)',
                }}
              >
                reply
              </span>
              <span
                aria-hidden
                className="cursor-block"
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 14,
                  background: 'var(--color-accent)',
                }}
              />
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--color-dim)',
                }}
              >
                esc · close
              </span>
            </div>
          </div>
        </aside>
      </div>

      <StatusBar />
    </PageFrame>
  );
}
