import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

const KPIS: Array<[string, string, string, 'success' | 'warn' | null]> = [
  ['streak', '6 / 7', 'days written', null],
  ['solve rate', '80%', '+4 vs prior 30d', 'success'],
  ['avg score', '+3.4', '+0.6 vs prior 30d', 'success'],
  ['median time', '27m', '−3m vs prior 30d', 'success'],
  ['weak topic', 'dp', 'detection 22%', 'warn'],
];

const RECENT: Array<[string, string, string, string, string, string, string]> = [
  ['#142', 'Two Sum', 'easy', '18m', '+5', 'today', 'success'],
  ['#141', 'Valid Parens', 'easy', '24m', '+4', 'today', 'success'],
  ['#140', '3Sum', 'med', '51m', '−2', 'yesterday', 'danger'],
  ['#139', 'Longest Substr', 'med', '33m', '+3', 'yesterday', 'success'],
  ['#138', 'Climbing Stairs', 'easy', '12m', '+2', '3d ago', 'success'],
  ['#137', 'Container', 'med', '—', '—', '4d ago', 'dim'],
];

const PATTERNS = [
  'you reach for a solution before checking edge cases',
  'replies shorten when stalled',
  'accept the first hint that "feels right"',
];

const DRILL = ['1. dp · edge-case-first', '2. dp · brute-to-opt', '3. graph · bfs/dfs'];

export function TodayPage() {
  return (
    <PageFrame>
      <TopBar
        title="algopeeps"
        right="◐ neovim · idle"
        tabs={[
          { label: 'today', active: true },
          { label: 'sessions' },
          { label: 'profile' },
          { label: 'analytics' },
        ]}
      />

      <div
        style={{
          flex: 1,
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
        }}
      >
        {/* KPI strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            border: '1px solid var(--color-hairline)',
          }}
        >
          {KPIS.map((k, i) => (
            <div
              key={i}
              style={{
                padding: '16px 18px',
                borderRight: i < 4 ? '1px solid var(--color-hairline)' : 'none',
              }}
            >
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
                  fontSize: 24,
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
                  marginTop: 6,
                }}
              >
                {k[2]}
              </div>
            </div>
          ))}
        </div>

        {/* begin row */}
        <div>
          <SectionLabel>begin a session</SectionLabel>
          <div style={{ display: 'flex', gap: 40, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--color-accent)', fontSize: 22, fontWeight: 500 }}>
              ▸ container with most water
              <span
                style={{
                  marginLeft: 12,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--color-dim)',
                  letterSpacing: '0.06em',
                }}
              >
                recommended · weak topic
              </span>
            </span>
            <span style={{ color: 'var(--color-bone)', fontSize: 18 }}>· pick a problem</span>
            <span style={{ color: 'var(--color-bone)', fontSize: 18 }}>· surprise me</span>
            <span style={{ color: 'var(--color-ash)', fontSize: 18 }}>· resume #137</span>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--color-hairline)' }} />

        {/* recent + rail */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <SectionLabel inline>recent</SectionLabel>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--color-ash)',
                }}
              >
                all →
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr 60px 70px 80px 80px',
                  padding: '6px 0',
                  fontSize: 10,
                  color: 'var(--color-dim)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid var(--color-hairline)',
                }}
              >
                <span>id</span>
                <span>title</span>
                <span>diff</span>
                <span>time</span>
                <span>score</span>
                <span style={{ textAlign: 'right' }}>when</span>
              </div>
              {RECENT.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr 60px 70px 80px 80px',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--color-hairline)',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: 'var(--color-dim)' }}>{r[0]}</span>
                  <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-bone)' }}>
                    {r[1]}
                  </span>
                  <span style={{ color: 'var(--color-dim)' }}>{r[2]}</span>
                  <span style={{ color: 'var(--color-ash)' }}>{r[3]}</span>
                  <span
                    style={{
                      color: `var(--color-${r[6]})`,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r[4]}
                  </span>
                  <span style={{ color: 'var(--color-dim)', textAlign: 'right' }}>{r[5]}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div>
              <SectionLabel>recent patterns</SectionLabel>
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.85,
                  color: 'var(--color-bone)',
                }}
              >
                {PATTERNS.map((p, i) => (
                  <div key={i}>· {p}</div>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>drill queue</SectionLabel>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 2,
                  color: 'var(--color-bone)',
                }}
              >
                {DRILL.map((d, i) => (
                  <div key={i}>{d}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <StatusBar />
    </PageFrame>
  );
}

function SectionLabel({
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
