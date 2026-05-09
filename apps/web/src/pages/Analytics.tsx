import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

const LENS = [
  { label: 'weak points', active: true },
  { label: 'still weak' },
  { label: 'most progress' },
  { label: 'per agent' },
  { label: 'per problem set' },
];

const ROWS: Array<[string, string, string, string, string, string, string, string?, string?]> = [
  ['dynamic programming', '5',  '22%', '40%', '49m', '−0.4', '↓ 0.6', 'still weak', 'warn'],
  ['graphs',              '3',  '41%', '33%', '53m', '+0.8', '↑ 1.2'],
  ['greedy',              '4',  '52%', '50%', '38m', '+1.4', '↑ 0.4'],
  ['two-pointer',         '8',  '79%', '62%', '31m', '+2.1', '↑ 1.1'],
  ['hashmap',             '14', '88%', '82%', '22m', '+3.4', '→ 0.0'],
  ['arrays',              '20', '92%', '90%', '18m', '+4.2', '↑ 0.5', 'strongest', 'success'],
];

const AGENTS: Array<[string, string, string, 'success' | 'warn' | 'danger']> = [
  ['cost-guide', '+1.4', 'biggest score lift', 'success'],
  ['contrarian', '+0.8', 'most ignored', 'warn'],
  ['pattern-seer', '+0.6', 'most accepted', 'success'],
  ['☎ consultor', '−0.9', 'used 24 times', 'danger'],
];

function signColor(s: string): string {
  if (s.startsWith('−') || s.startsWith('↓')) return 'var(--color-danger)';
  if (s.startsWith('→')) return 'var(--color-dim)';
  return 'var(--color-success)';
}

export function AnalyticsPage() {
  return (
    <PageFrame>
      <TopBar
        title="analytics"
        right="last 30 days · 30 sessions"
        tabs={[
          { label: 'today' },
          { label: 'sessions' },
          { label: 'profile' },
          { label: 'analytics', active: true },
        ]}
      />

      <div
        style={{
          flex: 1,
          padding: '28px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {/* Lens picker */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          {LENS.map((l) => (
            <span
              key={l.label}
              style={{
                color: l.active ? 'var(--color-bone)' : 'var(--color-ash)',
                padding: '6px 12px',
                border: `1px solid ${l.active ? 'var(--color-bone)' : 'var(--color-hairline2)'}`,
              }}
            >
              {l.label}
            </span>
          ))}
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-dim)',
              padding: '6px 0',
            }}
          >
            30d · 90d · all
          </span>
        </div>

        {/* table */}
        <div style={{ border: '1px solid var(--color-hairline)' }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-hairline)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-dim)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>by topic · weakest first</span>
            <span>sortable</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 50px 70px 90px 90px 100px 100px',
              padding: '8px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-dim)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderBottom: '1px solid var(--color-hairline)',
            }}
          >
            <span>topic</span>
            <span>n</span>
            <span>detect</span>
            <span>solve</span>
            <span>median t</span>
            <span>avg score</span>
            <span>delta 30d</span>
          </div>
          {ROWS.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 50px 70px 90px 90px 100px 100px',
                padding: '10px 16px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                borderTop: i ? '1px solid var(--color-hairline)' : 'none',
                alignItems: 'center',
                color: 'var(--color-bone)',
              }}
            >
              <span>
                {r[0]}
                {r[7] && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: `var(--color-${r[8]})`,
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    · {r[7]}
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--color-dim)' }}>{r[1]}</span>
              <span>{r[2]}</span>
              <span>{r[3]}</span>
              <span style={{ color: 'var(--color-ash)' }}>{r[4]}</span>
              <span style={{ color: signColor(r[5]) }}>{r[5]}</span>
              <span style={{ color: signColor(r[6]) }}>{r[6]}</span>
            </div>
          ))}
        </div>

        {/* two-up callouts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Callout
            label="still a weak point"
            title="dynamic programming"
            stat="30d delta  ↓ 0.6 · detection 22% · 5 attempts"
            statColor="danger"
            body="you reach for memoization without first naming the recurrence. the contrarian flagged this in 4 of 5 sessions; you only acted once."
          />
          <Callout
            label="most progress"
            title="two-pointer"
            stat="30d delta  ↑ 1.1 · detection 79% (+24)"
            statColor="success"
            body="detection rose 24 points after the consult-then-challenge pattern in #134 and #138. you now flag the pattern unprompted in ~80% of opportunities."
          />
        </div>

        {/* agent influence cards */}
        <div style={{ border: '1px solid var(--color-hairline)' }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-hairline)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--color-dim)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            which agent moved the needle
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            {AGENTS.map((a, i) => (
              <div
                key={i}
                style={{
                  padding: '16px 18px',
                  borderRight: i < AGENTS.length - 1 ? '1px solid var(--color-hairline)' : 'none',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  {a[0]}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 24,
                    color: 'var(--color-bone)',
                    fontWeight: 600,
                    marginTop: 6,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {a[1]}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: `var(--color-${a[3]})`,
                    marginTop: 4,
                  }}
                >
                  {a[2]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* single accent CTA */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span
            style={{
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
            }}
          >
            start drill →
          </span>
        </div>
      </div>

      <StatusBar />
    </PageFrame>
  );
}

function Callout({
  label,
  title,
  stat,
  statColor,
  body,
}: {
  label: string;
  title: string;
  stat: string;
  statColor: 'success' | 'danger';
  body: string;
}) {
  return (
    <div style={{ border: '1px solid var(--color-hairline)', padding: 18 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--color-dim)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: `var(--color-${statColor})`,
          marginBottom: 14,
        }}
      >
        {stat}
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--color-bone)', margin: 0 }}>
        {body}
      </p>
    </div>
  );
}
