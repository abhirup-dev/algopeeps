import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { ProblemStrip } from '../components/ProblemStrip';
import { CouncilStrip } from '../components/CouncilStrip';
import { AgentPane } from '../components/AgentPane';
import { UnifiedInputBar } from '../components/UnifiedInputBar';
import { GlobalDeferredBar } from '../components/GlobalDeferredBar';
import { StatusBar } from '../components/StatusBar';
import type { ActionLabel } from '../components/PaneActionRow';
import type { AgentSlot, FocusedSlot } from '../lib/types';
import {
  COMPOSER_BY_TARGET,
  COUNCIL_DEFERRED_LABEL,
  GLOBAL_DEFERRED,
  PANES,
  PROBLEM,
  SESSION_TIMER,
} from '../lib/mockSession';

interface ActivePageProps {
  focused: FocusedSlot;
  onFocusChange: (slot: FocusedSlot) => void;
}

/**
 * Active page · centerpiece.
 *
 * State separation (per uiux peer feedback):
 * - `focused`: which pane is double-clicked-zoomed. Layout-only — flexes
 *   2/1/1 and dims siblings. NEVER paints the targeted-accent outline.
 * - `target`: which pane(s) the next message addresses. Visual — paints
 *   the accent outline. Set by per-pane action click or `@N` in input.
 *   Default: null (broadcast — no pane gets the accent outline).
 *
 * The two are independent. Focusing the contrarian doesn't auto-target it;
 * the user can be focused on @2 while replying to @1 if they want.
 */
export function ActivePage({ focused, onFocusChange }: ActivePageProps) {
  const [mode, setMode] = useState<ActionLabel>('reply');
  const [target, setTarget] = useState<AgentSlot | null>(null);

  // ESC clears focus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focused !== null) {
        onFocusChange(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focused, onFocusChange]);

  // TO chip resolution: explicit target wins; otherwise focused pane drives it
  // (typing in the focused pane is implicitly addressed); otherwise broadcast.
  const composerSlot: AgentSlot | null = target ?? focused;

  // Flex distribution: focused=2x, others=1x. Default split is 1/1/1.
  const flexFor = (slot: AgentSlot) =>
    focused === null ? 1 : focused === slot ? 2 : 1;

  const handleAction = (action: ActionLabel, slot: AgentSlot) => {
    setMode(action);
    setTarget(slot); // action click → pane becomes the target.
  };

  const handleFocus = (slot: AgentSlot) => {
    onFocusChange(focused === slot ? null : slot);
  };

  const draft = useMemo(
    () =>
      composerSlot !== null
        ? COMPOSER_BY_TARGET[composerSlot]
        : 'no target — broadcast to council. type @1, @2, or @3 to address an agent.',
    [composerSlot],
  );
  const modeGlyph = MODE_GLYPH[mode];

  const toLabel =
    composerSlot !== null
      ? `@${composerSlot} ${PANES.find((p) => p.idx === composerSlot)!.agent}`
      : 'broadcast';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--color-bg)',
        color: 'var(--color-bone)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        fontFeatureSettings: '"tnum"',
      }}
    >
      <TopBar title="session" right={`⏱ ${SESSION_TIMER}`} />

      <ProblemStrip title={PROBLEM.title} difficulty={PROBLEM.difficulty} tags={PROBLEM.tags} />

      <CouncilStrip panes={PANES} deferredLabel={COUNCIL_DEFERRED_LABEL} />

      <div style={{ flex: 1, display: 'flex', minHeight: 540 }}>
        {PANES.map((p, i) => (
          <AgentPane
            key={p.idx}
            pane={p}
            first={i === 0}
            last={i === PANES.length - 1}
            flex={flexFor(p.idx)}
            targeted={target === p.idx}
            dim={focused !== null && focused !== p.idx}
            activeMode={mode}
            onAction={handleAction}
            onFocus={handleFocus}
          />
        ))}
      </div>

      <UnifiedInputBar
        toLabel={toLabel}
        toSlot={composerSlot}
        broadcast={composerSlot === null}
        modeLabel={`${modeGlyph} ${mode}`}
        draft={draft}
      />

      <GlobalDeferredBar items={GLOBAL_DEFERRED} />

      <StatusBar />
    </div>
  );
}

const MODE_GLYPH: Record<ActionLabel, string> = {
  reply: '↩',
  challenge: '⚔',
  defer: '⏸',
  draw: '✎',
  consult: '☎',
};
