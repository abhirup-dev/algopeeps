export type AgentSlot = 1 | 2 | 3;
export type FocusedSlot = AgentSlot | null;

export type AgentState = 'thinking' | 'idle' | 'spoke-last' | 'replied' | 'errored';

export type ExchangeTurn = ['agent' | 'you', string];

export interface AgentPaneData {
  idx: AgentSlot;
  agent: string;
  role: string;
  state: AgentState;
  currentPoint: string;
  exchange: ExchangeTurn[];
  /** Pane is in `replied · collapsed` summary mode (3rd-pane pattern). */
  collapsed?: boolean;
  /** Latest deferred question owned by this agent. */
  deferred?: string;
}

export interface DeferredItem {
  text: string;
  relativeTime: string;
}
