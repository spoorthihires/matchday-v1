export interface DriveListItem {
  id: string; name: string; domain: string; stream: string;
  month: string; frequency: string; eventDay: string;
  candCap: number; empCap: number; slotCap: number;
  status: 'Active' | 'Published' | 'Draft' | 'Archived';
  createdBy: string; primaryEventDate: string | null;
}
export interface DriveListResponse { items: DriveListItem[]; total: number; page: number; limit: number; }
export interface DriveListParams {
  // status/stream/domain accept a single value (the toolbar dropdowns) or CSV (a per-column
  // filter popover) — see drives.schemas.ts#csv.
  q?: string; status?: string; month?: string; stream?: string; domain?: string;
  monthFrom?: string; monthTo?: string;
  candCapFrom?: string; candCapTo?: string; empCapFrom?: string; empCapTo?: string;
  slotCapFrom?: string; slotCapTo?: string;
  sort?: string; order?: 'asc' | 'desc'; page?: number; limit?: number;
}
export interface EvaluationStage { key: 'mcq' | 'coding' | 'tara' | 'assignments'; enabled: boolean; config: Record<string, number>; evalConfigId?: string; }
export interface DriveInput {
  name: string; domain: string; stream: string; status?: string;
  candType: 'Freshers' | 'Experienced' | 'Both'; mode: 'Online' | 'Onsite' | 'Hybrid';
  frequency: 'Weekly' | 'Bi-weekly' | 'Monthly' | 'One-time'; eventDay: 'Wednesday' | 'Saturday';
  eventDates: string[]; candCap: number; empCap: number; slotCap: number;
  eligibility: { sources: string[]; branches: string[]; gradYears: number[]; expType: string };
  evaluation: EvaluationStage[];
  visibility: { employerReg: string; instituteVis: string; candidateAccess: string };
  templateId?: string;
  streamId?: string;
}
