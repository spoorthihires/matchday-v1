import { Jobseeker } from '../../models/Jobseeker.js';
import { Institute } from '../../models/Institute.js';

export const EM_CONTESTS = ['Frontend · Jul cohort', 'Backend · Jul cohort', 'Data/ML Specialists', 'Full-stack · Aug'];
export const EM_EMPLOYERS = ['Nexatech Labs', 'Aetherverse AI', 'Quantbridge', 'Helioserv'];
const MATCH_READY = new Set(['MatchReady', 'Shortlisted', 'Offer', 'Joined']);

export interface MonitorCandidate {
  id: string; code: string; name: string; institute: string;
  contest: string; employer: string; stage: number; score: number; minsAgo: number;
}

// Stable integer hash of the id hex — deterministic across requests (NOT Math.random).
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function deriveStage(
  js: { stage: string; evaluationStatus?: string; profileCompleted?: boolean },
  h: number,
): number {
  if (MATCH_READY.has(js.stage)) return 9;
  if (js.evaluationStatus === 'completed') return 8;
  if (js.evaluationStatus === 'pending') return 3 + (h % 5);   // 3..7
  if (js.profileCompleted) return 2;
  return h % 2;                                                // 0..1
}

const DATE_CAP: Record<string, number> = {
  'Today': 1440, 'Last 7 days': 10080, 'Last 30 days': 43200,
};

export async function getEvalMonitor(params: { contest?: string; employer?: string; institute?: string; date?: string }) {
  const insts = await Institute.find({}).select('name').lean();
  const instName = new Map(insts.map((i) => [String(i._id), i.name]));
  const rows = await Jobseeker.find({ stage: { $ne: 'DroppedOff' } }).lean();

  let candidates: MonitorCandidate[] = rows.map((r) => {
    const id = String(r._id);
    const h = hashId(id);
    const stage = deriveStage(r as never, h);
    return {
      id, code: `C-${id.slice(-6).toUpperCase()}`, name: r.name,
      institute: instName.get(String(r.instituteId)) ?? '—',
      contest: EM_CONTESTS[h % 4], employer: EM_EMPLOYERS[(h >>> 3) % 4],
      stage, score: stage >= 2 ? 45 + (h % 55) : 0, minsAgo: h % 2880,
    };
  });

  if (params.contest) candidates = candidates.filter((c) => c.contest === params.contest);
  if (params.employer) candidates = candidates.filter((c) => c.employer === params.employer);
  if (params.institute) candidates = candidates.filter((c) => c.institute === params.institute);
  const cap = params.date ? DATE_CAP[params.date] : undefined;
  if (cap !== undefined) candidates = candidates.filter((c) => c.minsAgo <= cap);

  return {
    candidates,
    contests: EM_CONTESTS,
    employers: EM_EMPLOYERS,
    institutes: insts.map((i) => i.name).sort(),
  };
}
