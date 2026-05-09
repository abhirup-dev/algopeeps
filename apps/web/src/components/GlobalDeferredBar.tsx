import type { DeferredItem } from '../lib/types';

interface GlobalDeferredBarProps {
  items: DeferredItem[];
}

export function GlobalDeferredBar({ items }: GlobalDeferredBarProps) {
  return (
    <div
      id="v6-defer-anchor"
      style={{
        borderTop: '1px solid var(--color-hairline)',
        background: 'var(--color-panel)',
      }}
    >
      <div
        style={{
          padding: '14px 36px 10px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}
      >
        <span
          style={{
            color: 'var(--color-warn)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontSize: 10,
          }}
        >
          deferred
        </span>
        <span style={{ color: 'var(--color-dim)' }}>
          {items.length} questions · oldest first · click any to reply now
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-dim)' }}>⌘D toggle</span>
      </div>
      <div style={{ borderTop: '1px solid var(--color-hairline)' }}>
        {items.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 60px',
              gap: 16,
              alignItems: 'baseline',
              padding: '11px 36px',
              borderTop: i ? '1px dashed var(--color-hairline2)' : 'none',
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                color: 'var(--color-bone)',
                fontStyle: 'italic',
                lineHeight: 1.55,
              }}
            >
              {d.text}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--color-dim)',
                textAlign: 'right',
              }}
            >
              {d.relativeTime}
            </span>
            <button
              type="button"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--color-accent)',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                textAlign: 'right',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              reply ↩
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
