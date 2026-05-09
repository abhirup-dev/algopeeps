import type { AgentPaneData, DeferredItem } from './types';

export const PROBLEM = {
  title: 'Two Sum',
  difficulty: 'medium',
  tags: 'two-pointer · arrays',
} as const;

export const SESSION_TIMER = '14:23';

export const COUNCIL_DEFERRED_LABEL = '3 questions deferred · see below ↓';

export const PANES: AgentPaneData[] = [
  {
    idx: 1,
    agent: 'cost-guide',
    role: 'complexity & tradeoffs',
    state: 'thinking',
    currentPoint:
      "you're scanning the array twice. what's the cost as ⟨n⟩ grows? trade space for time?",
    exchange: [['you', '"hashmap, key by value, look up the complement."']],
    deferred: 'worst-case lookup?',
  },
  {
    idx: 2,
    agent: 'contrarian',
    role: 'edge cases & failure modes',
    state: 'idle',
    currentPoint:
      'if the same number appears twice, your map will overwrite the first index. the lookup happens before the write — so when you process [3,3] with target 6, the second 3 looks up complement 3 and finds index 0 already mapped from the first iteration. that\'s the saving grace, not a bug. but it only works because of read-then-write order; flip it and you\'d get [1,1] which is invalid.',
    exchange: [],
    deferred: 'what about duplicates?',
  },
  {
    idx: 3,
    agent: 'pattern-seer',
    role: 'recognition & analogy',
    state: 'replied',
    collapsed: true,
    currentPoint:
      'this is a ⟨find-pair⟩ pattern. how does it differ from 3sum?',
    exchange: [
      ['you', '"two-sum returns indices; 3sum returns values. fixed-pair vs. variable-triple."'],
      ['agent', '"good. so what\'s the cost difference?"'],
    ],
    deferred: 'compare 3sum',
  },
];

export const GLOBAL_DEFERRED: DeferredItem[] = [
  { text: '"what about duplicates?"', relativeTime: '5m ago' },
  {
    text: '"compare to 3sum — is this the same find-pair pattern, or does the variable-triple structure of 3sum push it into a different complexity class? worth thinking about before we move on."',
    relativeTime: '3m ago',
  },
  { text: '"worst-case lookup if collisions?"', relativeTime: '47s ago' },
];

export const COMPOSER_BY_TARGET: Record<1 | 2 | 3, string> = {
  1: '@1 the lookup is O(1) average — i think we’re fine on duplicates because',
  2: '@2 fair point — but what if the input has ≥ 3 duplicates? does the read-then-write still hold',
  3: '@3 fixed-pair vs variable-triple — does that change which data structure you reach for',
};
