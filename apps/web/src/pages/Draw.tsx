import { TopBar } from '../components/TopBar';
import { StatusBar } from '../components/StatusBar';
import { PageFrame } from '../components/PageFrame';

const TOOLS = ['↗', '□', '○', '—', '→', 'T', '✎', '⌫'];
const ACTIVE_TOOL_INDEX = 4;

export function DrawPage() {
  return (
    <PageFrame>
      <TopBar title="session" right="⏱ 14:51" />

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
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 540 }}>
        {/* faint pane silhouettes underneath */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            opacity: 0.16,
          }}
        >
          <div style={{ flex: 1, borderRight: '1px solid var(--color-hairline)' }} />
          <div style={{ flex: 1, borderRight: '1px solid var(--color-hairline)' }} />
          <div style={{ flex: 1 }} />
        </div>

        {/* draw overlay */}
        <div
          style={{
            position: 'absolute',
            inset: '20px 64px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-accent-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--color-hairline)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-accent)',
              }}
            >
              draw a diagram
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-ash)',
              }}
            >
              explain visually — agents will read the sketch
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-dim)',
              }}
            >
              esc · close
            </span>
          </div>

          <div style={{ display: 'flex', flex: 1 }}>
            {/* tool sidebar */}
            <div
              style={{
                width: 56,
                borderRight: '1px solid var(--color-hairline)',
                padding: '14px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {TOOLS.map((t, i) => {
                const isActive = i === ACTIVE_TOOL_INDEX;
                return (
                  <div
                    key={i}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: isActive ? 'var(--color-accent)' : 'var(--color-ash)',
                      border: isActive ? '1px solid var(--color-accent-border)' : '1px solid transparent',
                    }}
                  >
                    {t}
                  </div>
                );
              })}
            </div>

            {/* canvas */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                background: 'var(--color-panel2)',
                overflow: 'hidden',
              }}
            >
              <svg
                width="100%"
                height="100%"
                style={{ position: 'absolute', inset: 0, opacity: 0.3 }}
              >
                <defs>
                  <pattern
                    id="v6grid"
                    width="28"
                    height="28"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 28 0 L 0 0 0 28"
                      fill="none"
                      stroke="var(--color-hairline)"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#v6grid)" />
              </svg>
              <svg
                viewBox="0 0 800 360"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                }}
              >
                <defs>
                  <marker
                    id="v6arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
                  </marker>
                </defs>
                {[2, 7, 11, 15, 3, 6].map((v, i) => (
                  <g key={i}>
                    <rect
                      x={120 + i * 84}
                      y={120}
                      width={68}
                      height={68}
                      fill="none"
                      stroke="var(--color-bone)"
                      strokeWidth={1.6}
                    />
                    <text
                      x={154 + i * 84}
                      y={158}
                      fill="var(--color-bone)"
                      fontFamily="JetBrains Mono"
                      fontSize={22}
                      textAnchor="middle"
                    >
                      {v}
                    </text>
                    <text
                      x={154 + i * 84}
                      y={210}
                      fill="var(--color-dim)"
                      fontFamily="JetBrains Mono"
                      fontSize={11}
                      textAnchor="middle"
                    >
                      {i}
                    </text>
                  </g>
                ))}
                <g stroke="var(--color-accent)" strokeWidth={2} fill="none">
                  <path d="M 154 80 q 0 16 0 30" markerEnd="url(#v6arrow)" />
                  <path d="M 488 80 q 0 16 0 30" markerEnd="url(#v6arrow)" />
                </g>
                <text
                  x={154}
                  y={62}
                  fill="var(--color-accent)"
                  fontFamily="JetBrains Mono"
                  fontSize={13}
                  textAnchor="middle"
                >
                  L
                </text>
                <text
                  x={488}
                  y={62}
                  fill="var(--color-accent)"
                  fontFamily="JetBrains Mono"
                  fontSize={13}
                  textAnchor="middle"
                >
                  R
                </text>
                <text
                  x={120}
                  y={272}
                  fill="var(--color-bone)"
                  fontFamily="Inter"
                  fontStyle="italic"
                  fontSize={15}
                >
                  two pointers — but i don't see how to converge
                </text>
                <text
                  x={120}
                  y={296}
                  fill="var(--color-ash)"
                  fontFamily="Inter"
                  fontStyle="italic"
                  fontSize={14}
                >
                  without sorting the array first?
                </text>
                <path
                  d="M 120 222 q 0 14 14 14 l 384 0 q 14 0 14 -14"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                />
                <text
                  x={326}
                  y={252}
                  fill="var(--color-accent)"
                  fontFamily="JetBrains Mono"
                  fontSize={12}
                  textAnchor="middle"
                >
                  unsorted
                </text>
              </svg>
            </div>
          </div>

          {/* multi-select send-to */}
          <div
            style={{
              borderTop: '1px solid var(--color-hairline)',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--color-dim)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              send to · multi-select
            </span>
            <SelectChip selected>@1 cost-guide ✓</SelectChip>
            <SelectChip>@2 contrarian</SelectChip>
            <SelectChip selected>@3 pattern-seer ✓</SelectChip>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-accent)',
              }}
            >
              send ↵
            </span>
          </div>
        </div>
      </div>

      <StatusBar />
    </PageFrame>
  );
}

function SelectChip({
  children,
  selected,
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: selected ? 'var(--color-accent)' : 'var(--color-ash)',
        padding: '4px 8px',
        border: `1px solid ${selected ? 'var(--color-accent-border)' : 'var(--color-hairline2)'}`,
      }}
    >
      {children}
    </span>
  );
}
