// Mirrors server/src/modules/slots/slots.service.ts SlotItem and
// server/src/modules/slots/slots.schemas.ts (slotFields / createSlotSchema / updateSlotSchema).

export type SlotStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export interface SlotItem {
  id: string;
  driveId: string;
  driveName: string;
  employerId: string | null;
  employerName: string; // '(Unallocated)' when employerId is null
  // ISO string (UTC midnight of the session day). Treated as a date-only calendar key via
  // `date.slice(0, 10)` — see calendarUtils.ts's `slotDayKey` for the rationale.
  date: string;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  capacity: number;
  booked: number;
  held: number;
  status: SlotStatus;
  link: string;
  attended: number;
  noShow: number;
}

// Create/patch shape — mirrors slots.schemas.ts `slotFields`. `driveId` is required on create;
// Task 6's mutations send `Partial<SlotInput>` for PATCH bodies (reschedule/link/no-shows/edit).
export interface SlotInput {
  date: string; // 'YYYY-MM-DD'
  start: string;
  end: string;
  capacity: number;
  booked: number;
  held?: number;
  status: SlotStatus;
  employerId?: string | null;
  driveId: string;
  link?: string;
  attended?: number;
  noShow?: number;
}

export interface SlotListParams {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
  employerId?: string;
}

export interface SlotListResponse {
  items: SlotItem[];
}
