import { Types } from 'mongoose';
import { Employer } from '../../models/Employer.js';
import { RegistrationRequest } from '../../models/RegistrationRequest.js';
import { Application } from '../../models/Application.js';
import { Slot } from '../../models/Slot.js';
import { SlotBooking } from '../../models/SlotBooking.js';
import { Drive } from '../../models/Drive.js';
import { codeFor } from '../jobseekers/jobseekers.service.js';

export type NotificationCategory = 'registration' | 'candidate' | 'slot';
export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  at: string;   // ISO
  link: string;
  read: boolean;
}
type RawItem = Omit<NotificationItem, 'read'>;

const REG_PREFIXES = ['Approved', 'Rejected', 'Changes requested'];

interface RegLean { _id: Types.ObjectId; driveName?: string; role?: string; activity?: { action: string; at: Date }[] }
interface AppLean { _id: Types.ObjectId; driveId: Types.ObjectId; jobseekerId: Types.ObjectId; consent?: { status?: string; respondedAt?: Date; requestedAt?: Date } }
interface SlotLean { _id: Types.ObjectId; driveId: Types.ObjectId; date: Date; start: string }
interface BookingLean { _id: Types.ObjectId; slotId: Types.ObjectId; jobseekerId: Types.ObjectId; createdAt: Date }

async function rawItems(employerId: string): Promise<RawItem[]> {
  const items: RawItem[] = [];

  // 1) registration status changes (from activity[])
  const regs = await RegistrationRequest.find({ employerId }).select('driveName role activity').lean<RegLean[]>();
  for (const r of regs) {
    (r.activity ?? []).forEach((a, idx) => {
      const prefix = REG_PREFIXES.find((p) => a.action.startsWith(p));
      if (!prefix) return;
      items.push({
        id: `reg:${r._id}:${idx}`,
        category: 'registration',
        title: `Registration ${prefix.toLowerCase()}`,
        body: `Your registration for "${r.driveName ?? '—'}" (${r.role ?? '—'}) — ${a.action}.`,
        at: new Date(a.at).toISOString(),
        link: '/employer/registrations',
      });
    });
  }

  // 2) consent responses
  const apps = await Application.find({ employerId, 'consent.status': { $in: ['granted', 'declined'] } })
    .select('driveId jobseekerId consent').lean<AppLean[]>();

  // 3) slot bookings on this employer's slots
  const slots = await Slot.find({ employerId }).select('_id driveId date start').lean<SlotLean[]>();
  const slotById = new Map(slots.map((s) => [String(s._id), s]));
  const bookings = slots.length
    ? await SlotBooking.find({ slotId: { $in: slots.map((s) => s._id) } }).select('slotId jobseekerId createdAt').lean<BookingLean[]>()
    : [];

  // batch drive names for consent + slot bodies
  const driveIds = new Set<string>();
  apps.forEach((a) => driveIds.add(String(a.driveId)));
  slots.forEach((s) => driveIds.add(String(s.driveId)));
  const drives = await Drive.find({ _id: { $in: [...driveIds] } }).select('name').lean<{ _id: Types.ObjectId; name?: string }[]>();
  const dname = new Map(drives.map((d) => [String(d._id), d.name ?? '—']));

  for (const a of apps) {
    const status = a.consent?.status;
    const at = a.consent?.respondedAt ?? a.consent?.requestedAt;
    if (!status || !at) continue;
    items.push({
      id: `consent:${a._id}`,
      category: 'candidate',
      title: `Identity reveal ${status}`,
      body: `Candidate ${codeFor(a.jobseekerId)} ${status} your reveal request for "${dname.get(String(a.driveId)) ?? '—'}".`,
      at: new Date(at).toISOString(),
      link: `/employer/drives/${a.driveId}/consent`,
    });
  }

  for (const b of bookings) {
    const slot = slotById.get(String(b.slotId));
    if (!slot) continue;
    items.push({
      id: `booking:${b._id}`,
      category: 'slot',
      title: 'New slot booking',
      body: `Candidate ${codeFor(b.jobseekerId)} booked a slot on ${new Date(slot.date).toISOString().slice(0, 10)} at ${slot.start} for "${dname.get(String(slot.driveId)) ?? '—'}".`,
      at: new Date(b.createdAt).toISOString(),
      link: `/employer/drives/${slot.driveId}/slots`,
    });
  }

  return items;
}

export async function buildNotifications(employerId: string): Promise<{ items: NotificationItem[]; unreadCount: number; lastReadAt: string | null }> {
  const emp = await Employer.findById(employerId).select('notificationsReadAt').lean<{ notificationsReadAt?: Date }>();
  const cursor = emp?.notificationsReadAt ? new Date(emp.notificationsReadAt).getTime() : 0;
  const raw = await rawItems(employerId);
  raw.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // ISO desc == chronological desc
  const items = raw.map((it) => ({ ...it, read: new Date(it.at).getTime() <= cursor }));
  return {
    items,
    unreadCount: items.filter((i) => !i.read).length,
    lastReadAt: emp?.notificationsReadAt ? new Date(emp.notificationsReadAt).toISOString() : null,
  };
}

export async function notificationsSummary(employerId: string): Promise<{ unreadCount: number; recent: NotificationItem[] }> {
  const { items, unreadCount } = await buildNotifications(employerId);
  return { unreadCount, recent: items.slice(0, 5) };
}

export async function markNotificationsRead(employerId: string): Promise<{ lastReadAt: string; unreadCount: number }> {
  const now = new Date();
  await Employer.updateOne({ _id: employerId }, { $set: { notificationsReadAt: now } });
  return { lastReadAt: now.toISOString(), unreadCount: 0 };
}
