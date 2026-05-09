import type { AgentSlot } from '../lib/types';

const ACTIONS = [
  { glyph: '↩︎', label: 'reply', tip: 'Write a response to this agent.' },
  { glyph: '⚔︎', label: 'challenge', tip: "Push back on this agent's claim." },
  { glyph: '⏸︎', label: 'defer', tip: 'Park this for later.' },
  { glyph: '✎︎', label: 'draw', tip: 'Sketch a diagram to send.' },
  { glyph: '☎︎', label: 'consult', tip: 'Ask the Consultor about this.' },
] as const;

export type ActionLabel = (typeof ACTIONS)[number]['label'];

interface PaneActionRowProps {
  first: boolean;
  last: boolean;
  muted?: boolean;
  activeMode?: ActionLabel;
  onAction?: (action: ActionLabel, slot: AgentSlot) => void;
  slot: AgentSlot;
}

export function PaneActionRow({ first, last, muted, activeMode, onAction, slot }: PaneActionRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        borderTop: '1px solid var(--color-hairline)',
        opacity: muted ? 0.35 : 1,
        background: 'var(--color-panel2)',
        paddingLeft: first ? 36 : 18,
        paddingRight: last ? 36 : 18,
      }}
    >
      {ACTIONS.map((a, i) => {
        const isActive = activeMode === a.label;
        return (
          <button
            key={a.label}
            type="button"
            title={a.tip}
            onClick={() => onAction?.(a.label, slot)}
            style={{
              flex: 1,
              padding: '12px 4px',
              textAlign: 'center',
              borderRight: i < ACTIONS.length - 1 ? '1px solid var(--color-hairline)' : 'none',
              background: 'transparent',
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 17,
              lineHeight: 1,
              color: isActive ? 'var(--color-accent)' : 'var(--color-ash)',
              transition: 'color 120ms ease-out',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--color-ash)';
            }}
          >
            {a.glyph}
          </button>
        );
      })}
    </div>
  );
}
