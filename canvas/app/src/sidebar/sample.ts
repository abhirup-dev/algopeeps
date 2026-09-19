import type { SidebarItem } from "./ThreadsSidebar";

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const SAMPLE_ITEMS: SidebarItem[] = [
  {
    id: "sample-1",
    index: 1,
    title: "nums[1]",
    subtitle: "Array lookup",
    status: "open",
    collapsed: true,
    unread: true,
    lines: [
      { author: "human", text: "Why j = i + 1?", ts: ago(3) },
      {
        author: "agent",
        text: "It avoids comparing the element with itself.",
        ts: ago(0.2),
      },
    ],
  },
  {
    id: "sample-2",
    index: 2,
    title: "pointer j",
    status: "open",
    collapsed: true,
    lines: [{ author: "human", text: "Should this move first?", ts: ago(75) }],
  },
  {
    id: "sample-3",
    index: 3,
    title: "test case",
    subtitle: "Edge case",
    status: "resolved",
    collapsed: true,
    lines: [
      {
        author: "agent",
        text: "Covered by the empty-input test.",
        ts: ago(140),
      },
    ],
  },
];
