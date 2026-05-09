import type { AgentSlot } from '../lib/types';

interface UnifiedInputBarProps {
  toLabel: string;
  toSlot: AgentSlot | null;
  broadcast?: boolean;
  modeLabel: string;
  draft: string;
}

export function UnifiedInputBar({ toLabel, broadcast, modeLabel, draft }: UnifiedInputBarProps) {
  return (
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
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}
      >
        <ChipLabel>to</ChipLabel>
        <Chip variant={broadcast ? 'neutral' : 'accent'}>{toLabel}</Chip>
        <ChipLabel style={{ marginLeft: 14 }}>mode</ChipLabel>
        <Chip variant="neutral">{modeLabel}</Chip>
        <span style={{ marginLeft: 'auto', color: 'var(--color-dim)' }}>
          tab to cycle target · / for slash commands
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          border: '1px solid var(--color-accent-border)',
          background: 'var(--color-bg)',
          boxShadow: 'inset 0 0 0 1px var(--color-accent-soft)',
        }}
      >
        <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: 16 }}>
          ▸
        </span>
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--color-bone)' }}
        >
          {draft}
        </span>
        <span
          aria-hidden
          className="cursor-block"
          style={{
            display: 'inline-block',
            width: 8,
            height: 18,
            background: 'var(--color-accent)',
          }}
        />
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-accent)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          send ⏎
        </span>
      </div>
    </div>
  );
}

function ChipLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        color: 'var(--color-dim)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontSize: 10,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'accent' | 'neutral';
}) {
  const isAccent = variant === 'accent';
  return (
    <span
      style={{
        color: isAccent ? 'var(--color-accent)' : 'var(--color-bone)',
        padding: '3px 8px',
        border: `1px solid ${isAccent ? 'var(--color-accent-border)' : 'var(--color-hairline2)'}`,
        borderRadius: 2,
      }}
    >
      {children}
    </span>
  );
}
