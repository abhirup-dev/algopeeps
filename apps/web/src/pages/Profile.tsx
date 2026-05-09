import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

// Neutral graphite ramp via tokens — switches correctly under light theme.
// See design.md §Components → heatmapCell{Empty,Low,Mid,High}.
const HEATMAP_RAMP = [
  'var(--color-panel2)',  // empty
  'var(--color-faint)',   // low
  'var(--color-dim)',     // mid
  'var(--color-ash)',     // high
  'var(--color-bone)',    // peak (rare)
];

const KPIS: Array<[string, string, string, 'success' | 'warn' | null]> = [
  ['sessions', '64', 'last 90d', null],
  ['solved', '52', '81%', 'success'],
  ['avg score', '+3.4', '+0.6 vs prior', 'success'],
  ['median time', '27m', '−3m', 'success'],
  ['consults / sess', '0.8', 'down 0.2', 'success'],
  ['challenges / sess', '1.6', 'up 0.3', 'success'],
];

const SCORE_HISTORY = [2, 4, 3, -1, 3, 5, 2, 4, -2, 3, 4, 5, 2, 4, 3, 5, -1, 2, 4, 5, 4, 3, 5, 4, 5, -1, 4, 5, 5, 4];

const PROBLEM_SETS: Array<[string, string, string, number, string, boolean, 'success' | 'warn']> = [
  ['neetcode 150', '150', '78%', 0.78, '+3.6', false, 'success'],
  ['blind 75', '75', '92%', 0.92, '+4.1', false, 'success'],
  ['google interview prep', '40', '60%', 0.60, '+2.4', true, 'success'],
  ['dp deep-dive', '24', '38%', 0.38, '+1.2', false, 'warn'],
  ['weekly contests', '12', '50%', 0.50, '+2.8', false, 'success'],
];

export function ProfilePage() {
  // Deterministic ramp so the heatmap stays consistent across renders.
  const cells = Array.from({ length: 91 }, (_, i) => {
    const seed = (i * 37 + 7) % 11;
    return seed > 7 ? 0 : seed > 5 ? 1 : seed > 3 ? 2 : seed > 1 ? 3 : 4;
  });

  return (
    <PageFrame>
      <TopBar
        title="profile"
        right="last 90 days · 64 sessions"
        tabs={[
          { label: 'today' },
          { label: 'sessions' },
          { label: 'profile', active: true },
          { label: 'analytics' },
        ]}
      />

      <div
        style={{
          flex: 1,
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 36,
        }}
      >
        {/* heatmap + kpi grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 32,
            alignItems: 'start',
          }}
        >
          <div>
            <Eyebrow>activity · 90 days</Eyebrow>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(13, 1fr)',
                gap: 4,
              }}
            >
              {cells.map((v, i) => (
                <span
                  key={i}
                  style={{ aspectRatio: '1 / 1', background: HEATMAP_RAMP[v] }}
                />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--color-dim)',
              }}
            >
              <span>less</span>
              {HEATMAP_RAMP.map((c, i) => (
                <span
                  key={i}
                  style={{ width: 10, height: 10, background: c }}
                />
              ))}
              <span>more</span>
              <span style={{ marginLeft: 'auto' }}>
                longest streak <span style={{ color: 'var(--color-bone)' }}>14 days</span>
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1,
              background: 'var(--color-hairline)',
              border: '1px solid var(--color-hairline)',
            }}
          >
            {KPIS.map((k, i) => (
              <div key={i} style={{ background: 'var(--color-bg)', padding: '14px 16px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--color-dim)',
                    marginBottom: 8,
                  }}
                >
                  {k[0]}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 22,
                    color: 'var(--color-bone)',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {k[1]}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: k[3] ? `var(--color-${k[3]})` : 'var(--color-ash)',
                    marginTop: 4,
                  }}
                >
                  {k[2]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* score chart */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <Eyebrow inline>session score · last 30 sessions</Eyebrow>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-dim)',
              }}
            >
              median <span style={{ color: 'var(--color-bone)' }}>+3</span>
            </span>
          </div>
          <div
            style={{
              height: 90,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              borderBottom: '1px solid var(--color-hairline)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: 1,
                background: 'var(--color-hairline2)',
              }}
            />
            {SCORE_HISTORY.map((v, i) => {
              const max = 6;
              const h = (Math.abs(v) / max) * 36;
              const isLast = i === SCORE_HISTORY.length - 1;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      width: '100%',
                      height: h,
                      background: isLast ? 'var(--color-accent)' : 'var(--color-ash)',
                      opacity: isLast ? 1 : 0.6,
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: v >= 0 ? `calc(50% - ${h}px)` : '50%',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* problem sets */}
        <div>
          <Eyebrow>problem sets</Eyebrow>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 70px 90px 1fr 80px',
                padding: '6px 0',
                fontSize: 10,
                color: 'var(--color-dim)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--color-hairline)',
              }}
            >
              <span>set</span>
              <span>n</span>
              <span>solved</span>
              <span>progress</span>
              <span style={{ textAlign: 'right' }}>avg score</span>
            </div>
            {PROBLEM_SETS.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 70px 90px 1fr 80px',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-hairline)',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-bone)' }}>
                  {r[0]}
                </span>
                <span style={{ color: 'var(--color-dim)' }}>{r[1]}</span>
                <span style={{ color: 'var(--color-ash)' }}>{r[2]}</span>
                <span
                  style={{
                    position: 'relative',
                    height: 6,
                    background: 'var(--color-hairline)',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${r[3] * 100}%`,
                      background: r[5] ? 'var(--color-accent)' : 'var(--color-ash)',
                      opacity: r[5] ? 1 : 0.7,
                    }}
                  />
                </span>
                <span style={{ color: `var(--color-${r[6]})`, textAlign: 'right' }}>{r[4]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <StatusBar />
    </PageFrame>
  );
}

function Eyebrow({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <span
      style={{
        display: inline ? 'inline' : 'block',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--color-dim)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: inline ? 0 : 14,
      }}
    >
      {children}
    </span>
  );
}
