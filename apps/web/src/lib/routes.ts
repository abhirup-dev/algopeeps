export type RouteKey =
  | 'today'
  | 'active'
  | 'peek'
  | 'consultor'
  | 'draw'
  | 'postmortem'
  | 'profile'
  | 'analytics'
  | 'testdemo';

export interface Route {
  key: RouteKey;
  path: string;
  short: string;
}

export const ROUTES: Route[] = [
  { key: 'today',      path: '#today',      short: 'today' },
  { key: 'active',     path: '#active',     short: 'active' },
  { key: 'peek',       path: '#peek',       short: 'peek' },
  { key: 'consultor',  path: '#consultor',  short: 'consult' },
  { key: 'draw',       path: '#draw',       short: 'draw' },
  { key: 'postmortem', path: '#postmortem', short: 'p-mortem' },
  { key: 'profile',    path: '#profile',    short: 'profile' },
  { key: 'analytics',  path: '#analytics',  short: 'analytics' },
  { key: 'testdemo',   path: '#testdemo',   short: 'test' },
];

export function routeFromHash(hash: string): RouteKey {
  const k = hash.replace(/^#/, '') as RouteKey;
  return ROUTES.some((r) => r.key === k) ? k : 'active';
}
