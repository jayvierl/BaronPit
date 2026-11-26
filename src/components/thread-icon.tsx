const paths = {
  heart: "M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 6l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8l8 8a1.2 1.2 0 0 0 1.8 0l8-8a5.5 5.5 0 0 0-.1-7.8z",
  reply: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5Z",
  repost: "m2 8 4-4 4 4M6 4v10a3 3 0 0 0 3 3h3m10-1-4 4-4-4m4 4V10a3 3 0 0 0-3-3h-3",
  share: "m21 3-7.4 18-3.1-8.2L3 9.5 21 3Zm-10.5 9.8L21 3",
  save: "M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z",
  reactions: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 14.5c2.2 3 5.8 3 8 0M8.5 9h.1m6.8 0h.1",
  back: "m13.5 5-7 7 7 7M7 12h14",
};

export function ThreadIcon({ name, filled = false }: { name: keyof typeof paths; filled?: boolean }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}
