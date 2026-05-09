import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

const TAGS = ['arrays', 'two-pointer', 'hashmap'];

const EXAMPLES = [
  ['[2,7,11,15]', '9', '[0,1]', 'nums[0] + nums[1] = 2 + 7 = 9'],
  ['[3,2,4]', '6', '[1,2]', 'nums[1] + nums[2] = 2 + 4 = 6'],
  ['[3,3]', '6', '[0,1]', 'duplicate values are valid; indices must differ'],
];

const HISTORY: Array<[string, string, string, 'success' | null]> = [
  ['attempts', '3', 'twice solved', null],
  ['best score', '+5', '#142 today', 'success'],
  ['median time', '21m', 'topic median 27m', null],
  ['detection', '79%', 'two-pointer pattern', 'success'],
];

const TESTS: Array<[string, string, 'success' | 'danger' | 'dim']> = [
  ['basic', '✓', 'success'],
  ['negatives', '✓', 'success'],
  ['duplicates', '✗', 'danger'],
  ['large input', '·', 'dim'],
];

const RELATED = [
  ['3sum', 'medium · solved'],
  ['4sum', 'medium · not attempted'],
  ['two sum II — sorted', 'easy · solved'],
  ['two sum — bst', 'easy · not attempted'],
];

export function ProblemPeekPage() {
  return (
    <PageFrame>
      <TopBar title="session" right="⏱ 14:23" />

      {/* problem strip */}
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
        <Mono color="ash">medium</Mono>
        <Mono color="dim">two-pointer · arrays</Mono>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-accent)',
            padding: '2px 8px',
            border: '1px solid var(--color-accent-border)',
          }}
        >
          ? collapse
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Mono color="dim">esc · close peek</Mono>
        </span>
      </div>

      {/* council strip — paused */}
      <div
        style={{
          padding: '12px 36px',
          borderBottom: '1px solid var(--color-hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          opacity: 0.5,
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
        <span style={{ color: 'var(--color-faint)' }}>① cost-guide ⏸</span>
        <span style={{ color: 'var(--color-faint)' }}>② contrarian ⏸</span>
        <span style={{ color: 'var(--color-faint)' }}>③ pattern-seer ⏸</span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-dim)' }}>
          paused while peek is open
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
        }}
      >
        {/* left brief */}
        <div
          style={{
            padding: '28px 36px',
            borderRight: '1px solid var(--color-hairline)',
          }}
        >
          <Eyebrow>problem #001</Eyebrow>
          <div
            style={{
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              marginBottom: 6,
            }}
          >
            Two Sum
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 24,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                color: 'var(--color-warn)',
                padding: '3px 8px',
                border: '1px solid var(--color-warn-dim)',
              }}
            >
              medium
            </span>
            {TAGS.map((t) => (
              <span
                key={t}
                style={{
                  color: 'var(--color-ash)',
                  padding: '3px 8px',
                  border: '1px solid var(--color-hairline2)',
                }}
              >
                {t}
              </span>
            ))}
          </div>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: 'var(--color-bone)',
              margin: '0 0 12px',
              maxWidth: 620,
            }}
          >
            Given an array of integers <Code>nums</Code> and an integer <Code>target</Code>, return
            the indices of the two numbers such that they add up to <Code>target</Code>.
          </p>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: 'var(--color-ash)',
              margin: '0 0 28px',
              maxWidth: 620,
            }}
          >
            You may assume each input has exactly one solution, and you may not use the same
            element twice. The answer can be returned in any order.
          </p>

          <Eyebrow>examples</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {EXAMPLES.map((ex, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--color-hairline)',
                  padding: '12px 16px',
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr',
                  gap: 8,
                  rowGap: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              >
                <Mono color="dim">nums</Mono>
                <Mono color="bone">{ex[0]}</Mono>
                <Mono color="dim">target</Mono>
                <Mono color="bone">{ex[1]}</Mono>
                <Mono color="dim">output</Mono>
                <Mono color="success">{ex[2]}</Mono>
                <Mono color="dim">note</Mono>
                <span
                  style={{
                    color: 'var(--color-ash)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12.5,
                  }}
                >
                  {ex[3]}
                </span>
              </div>
            ))}
          </div>

          <Eyebrow>constraints</Eyebrow>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              lineHeight: 1.95,
              color: 'var(--color-bone)',
            }}
          >
            <div>2 ≤ nums.length ≤ 10⁴</div>
            <div>−10⁹ ≤ nums[i] ≤ 10⁹</div>
            <div>−10⁹ ≤ target ≤ 10⁹</div>
            <div style={{ color: 'var(--color-ash)' }}>only one valid answer exists.</div>
          </div>
        </div>

        {/* right rail */}
        <div
          style={{
            padding: '28px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div>
            <Eyebrow>your history</Eyebrow>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                background: 'var(--color-hairline)',
                border: '1px solid var(--color-hairline)',
              }}
            >
              {HISTORY.map((k, i) => (
                <div
                  key={i}
                  style={{ background: 'var(--color-bg)', padding: '12px 14px' }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--color-dim)',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    {k[0]}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 20,
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

          <div>
            <Eyebrow>tests</Eyebrow>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                border: '1px solid var(--color-hairline)',
              }}
            >
              {TESTS.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr 60px',
                    padding: '8px 14px',
                    borderTop: i ? '1px solid var(--color-hairline)' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: `var(--color-${t[2]})` }}>{t[1]}</span>
                  <span style={{ color: 'var(--color-bone)' }}>{t[0]}</span>
                  <span
                    style={{
                      color: 'var(--color-dim)',
                      textAlign: 'right',
                      fontSize: 10.5,
                    }}
                  >
                    @s16
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-accent)',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
              }}
            >
              ⌘R run all
            </div>
          </div>

          <div>
            <Eyebrow>related</Eyebrow>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                lineHeight: 2,
                color: 'var(--color-ash)',
              }}
            >
              {RELATED.map(([title, sub]) => (
                <div key={title}>
                  · {title} <span style={{ color: 'var(--color-dim)' }}>{sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <StatusBar />
    </PageFrame>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--color-dim)',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Mono({
  children,
  color = 'bone',
}: {
  children: React.ReactNode;
  color?: 'bone' | 'ash' | 'dim' | 'accent' | 'success';
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: `var(--color-${color})`,
      }}
    >
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-bone)' }}>{children}</span>
  );
}
