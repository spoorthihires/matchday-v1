import { Schema, model, type InferSchemaType } from 'mongoose';

export const SUPPORT_CATEGORIES = [
  'More candidates', 'Slot change', 'Candidate replacement', 'No-show',
  'Profile/data issue', 'Resume access', 'Commercial/billing', 'Other',
] as const;
export const SUPPORT_PRIORITIES = ['Low', 'Normal', 'High'] as const;
export const SUPPORT_STATUSES = ['Open', 'In progress', 'Resolved'] as const;

const supportRequestSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true, index: true },
  category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  priority: { type: String, enum: SUPPORT_PRIORITIES, default: 'Normal' },
  status: { type: String, enum: SUPPORT_STATUSES, default: 'Open' },
  createdAt: { type: Date, default: Date.now },
});

export type SupportRequestDoc = InferSchemaType<typeof supportRequestSchema>;
export const SupportRequest = model('SupportRequest', supportRequestSchema);
