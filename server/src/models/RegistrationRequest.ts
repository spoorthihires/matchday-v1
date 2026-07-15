import { Schema, model, type InferSchemaType } from 'mongoose';

export const REGISTRATION_STATUSES = ['Pending review', 'Approved', 'Rejected', 'Changes requested'] as const;

const panelistSchema = new Schema({
  name: { type: String, required: true },
  role: { type: String, default: '' },
}, { _id: false });

const activitySchema = new Schema({
  action: { type: String, required: true },
  by: { type: String, default: 'Platform Admin' },
  at: { type: Date, default: Date.now },
}, { _id: false });

const registrationSchema = new Schema({
  company: { type: String, required: true },
  industry: { type: String, required: true },
  role: { type: String, required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', default: null },
  driveName: { type: String, default: '' },
  openings: { type: Number, default: 1 },
  ctcRange: { type: String, default: '' },
  skills: { type: [String], default: [] },
  slot: { type: String, default: '' },
  panel: { type: [panelistSchema], default: [] },
  jd: { type: String, default: '' },
  submittedBy: { type: String, default: '' },
  status: { type: String, enum: REGISTRATION_STATUSES, default: 'Pending review' },
  activity: { type: [activitySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export type RegistrationDoc = InferSchemaType<typeof registrationSchema>;
export const RegistrationRequest = model('RegistrationRequest', registrationSchema);
