export interface FunnelStep {
  name: string;
  value: number;
  pct: number | null;
}

export interface DashboardOverview {
  readiness: {
    score: number;
    verdict: { label: string; tone: 'ontrack' | 'at-risk' | 'off-track' };
    nextMatchDay: string;
    countdown: { days: number; hours: number };
    pillars: { key: 'supply' | 'demand' | 'slots' | 'evaluations'; pct: number; caption: string }[];
    attention: { message: string } | null;
  };
  kpis: {
    key: string;
    label: string;
    group: string;
    value: number;
    display: string;
    delta: { value: number; direction: 'up' | 'down' | 'flat'; display: string };
  }[];
  funnels: {
    supply: FunnelStep[];
    demand: FunnelStep[];
    hiring: FunnelStep[];
  };
  schedule: {
    monthLabel: string;
    calendar: { day: number; inMonth: boolean; isWed: boolean; isToday: boolean; isNextMatchDay: boolean }[];
    events: {
      date: string;
      title: string;
      employers: number;
      slots: number;
      candidates: number;
      prepPct: number;
      status: 'prep' | 'open';
    }[];
  };
  slotUtilization: {
    booked: number;
    held: number;
    available: number;
    total: number;
    utilizedPct: number;
  };
  leaderboards: {
    institutes: { rank: number; name: string; city: string; ready: number; conversionPct: number }[];
    employers: { rank: number; name: string; industry: string; offers: number; fillRatePct: number }[];
  };
}
