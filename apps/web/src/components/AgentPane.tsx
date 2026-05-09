import type { AgentPaneData, AgentSlot } from '../lib/types';
import { PaneActionRow, type ActionLabel } from './PaneActionRow';

interface AgentPaneProps {
  pane: AgentPaneData;
  first: boolean;
  last: boolean;
  flex?: number;
  targeted?: boolean;
  dim?: boolean;
  activeMode?: ActionLabel;
  onAction?: (action: ActionLabel, slot: AgentSlot) => void;
  onFocus?: (slot: AgentSlot) => void;
}

const NUMERAL: Record<1 | 2 | 3, string> = { 1: '①', 2: '②', 3: '③' };

export function AgentPane({
  pane,
  first,
  last,
  flex = 1,
  targeted,
  dim,
  activeMode,
  onAction,
  onFocus,
}: AgentPaneProps) {
  const padL = first ? 36 : 18;
  const padR = last ? 36 : 18;

  const containerStyle: React.CSSProperties = {
    flex,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    borderRight: last ? 'none' : '1px solid var(--color-hairline)',
    outline: targeted ? '1px solid var(--color-accent-border)' : 'none',
    outlineOffset: '-1px',
    position: 'relative',
    zIndex: targeted ? 2 : 1,
    opacity: dim ? 0.32 : 1,
    filter: dim ? 'saturate(0.4)' : 'none',
    background: pane.collapsed ? 'rgba(0,0,0,0.25)' : 'transparent',
    transition: 'flex 220ms ease-out, opacity 220ms ease-out, filter 220ms ease-out',
  };

  return (
    <section
      style={containerStyle}
      onDoubleClick={() => onFocus?.(pane.idx)}
      aria-label={`Agent ${NUMERAL[pane.idx]} ${pane.agent}`}
    >
      <PaneHeader
        idx={pane.idx}
        agent={pane.agent}
        role={pane.role}
        state={pane.state}
        collapsed={pane.collapsed}
        padL={padL}
        padR={padR}
      />

      {pane.collapsed ? (
        <CollapsedBody pane={pane} padL={padL} padR={padR} />
      ) : (
        <ActiveBody pane={pane} padL={padL} padR={padR} />
      )}

      <PaneActionRow
        first={first}
        last={last}
        muted={pane.collapsed}
        activeMode={targeted ? activeMode : undefined}
        onAction={onAction}
        slot={pane.idx}
      />
    </section>
  );
}

function PaneHeader({
  idx,
  agent,
  role,
  state,
  collapsed,
  padL,
  padR,
}: {
  idx: AgentSlot;
  agent: string;
  role: string;
  state: AgentPaneData['state'];
  collapsed?: boolean;
  padL: number;
  padR: number;
}) {
  const dotColor =
    state === 'thinking'
      ? 'var(--color-accent)'
      : state === 'spoke-last'
        ? 'var(--color-success)'
        : 'var(--color-dim)';

  return (
    <div
      style={{
        padding: `12px ${padR}px 12px ${padL}px`,
        borderBottom: '1px solid var(--color-hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: collapsed ? 0.55 : 1,
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-ash)' }}>
        @{idx}
      </span>
      <span
        aria-hidden
        className={state === 'thinking' ? 'throb' : undefined}
        style={{
          display: 'inline-block',
          width: state === 'thinking' ? 10 : 6,
          height: state === 'thinking' ? 10 : 6,
          background: dotColor,
          borderRadius: state === 'thinking' ? 2 : '50%',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          {agent}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-dim)' }}>
          {role}
        </span>
      </div>
      {collapsed && (
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--color-success)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          ✓ replied
        </span>
      )}
    </div>
  );
}

function ActiveBody({ pane, padL, padR }: { pane: AgentPaneData; padL: number; padR: number }) {
  return (
    <div
      style={{
        flex: 1,
        padding: `16px ${padR}px 16px ${padL}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflow: 'hidden',
      }}
    >
      <Block label="agent" body={pane.currentPoint} bodySize={14.5} bodyColor="var(--color-bone)" />
      {pane.exchange.map((m, i) => (
        <Block key={i} label={m[0]} body={m[1]} bodySize={13.5} bodyColor="var(--color-bone)" />
      ))}
      {pane.state === 'thinking' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-dim)' }}>
            thinking…
          </span>
        </div>
      )}
    </div>
  );
}

function CollapsedBody({
  pane,
  padL,
  padR,
}: {
  pane: AgentPaneData;
  padL: number;
  padR: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: `14px ${padR}px 14px ${padL}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: 0.42,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dim)',
        }}
      >
        last exchange
      </span>
      <p
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: 'var(--color-ash)',
          fontStyle: 'italic',
          margin: 0,
        }}
      >
        {pane.currentPoint}
      </p>
      {pane.exchange.map((m, i) => (
        <p key={i} style={{ fontSize: 12, color: 'var(--color-dim)', margin: 0 }}>
          <span style={{ color: 'var(--color-faint)' }}>{m[0]} · </span>
          {m[1]}
        </p>
      ))}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--color-dim)',
          marginTop: 6,
        }}
      >
        collapsed · click to expand
      </span>
    </div>
  );
}

function Block({
  label,
  body,
  bodySize,
  bodyColor,
}: {
  label: string;
  body: string;
  bodySize: number;
  bodyColor: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dim)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <p style={{ fontSize: bodySize, lineHeight: 1.6, color: bodyColor, margin: 0 }}>{body}</p>
    </div>
  );
}
