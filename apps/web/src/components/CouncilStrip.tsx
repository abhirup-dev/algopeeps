import type { AgentPaneData } from '../lib/types';

interface CouncilStripProps {
  panes: AgentPaneData[];
  deferredLabel: string;
}

const NUMERAL: Record<1 | 2 | 3, string> = { 1: '①', 2: '②', 3: '③' };

export function CouncilStrip({ panes, deferredLabel }: CouncilStripProps) {
  return (
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

      {panes.map((p) => (
        <CouncilEntry key={p.idx} pane={p} />
      ))}

      <span style={{ marginLeft: 'auto', color: 'var(--color-dim)' }}>{deferredLabel}</span>
    </div>
  );
}

function CouncilEntry({ pane }: { pane: AgentPaneData }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--color-ash)' }}>
        {NUMERAL[pane.idx]} {pane.agent}
      </span>
      <StateGlyph state={pane.state} />
    </span>
  );
}

function StateGlyph({ state }: { state: AgentPaneData['state'] }) {
  if (state === 'thinking') {
    return (
      <>
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
        <span style={{ color: 'var(--color-accent)' }}>thinking</span>
      </>
    );
  }
  if (state === 'spoke-last') {
    return <span style={{ color: 'var(--color-success)' }}>▸ spoke last</span>;
  }
  if (state === 'replied') {
    return <span style={{ color: 'var(--color-success)' }}>✓ replied</span>;
  }
  return <span style={{ color: 'var(--color-dim)' }}>· idle</span>;
}
