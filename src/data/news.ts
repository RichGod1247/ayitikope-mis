export type NewsItem = {
  id: string;
  date: string; // ISO date like "2025-10-01"
  title: string;
  summary: string;
  href?: string; // optional link
};

export const NEWS: NewsItem[] = [
  {
    id: "award-2025",
    date: "2025-10-01",
    title: "Ayitikope wins District Award of Excellence",
    summary:
      "The school received a district-level award for outstanding academic growth and community service.",
    href: "/gallery",
  },
  {
    id: "ict-lab",
    date: "2025-09-22",
    title: "New ICT Lab Milestone",
    summary:
      "Phase 1 completed — secured devices and installed networking. Phase 2 adds coding clubs.",
    href: "/gallery",
  },
  {
    id: "kg-play-day",
    date: "2025-09-05",
    title: "KG Play & Learn Day",
    summary:
      "A joyful day of guided play, creativity, and early literacy with parents and teachers.",
    href: "/gallery",
  },
];
