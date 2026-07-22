import { Schema, model, type InferSchemaType } from 'mongoose';
import { KANBAN_STAGES } from '../constants/kanban.js';

const noteSchema = new Schema({
  text: { type: String, required: true },
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false });

// Per-(employer × drive × candidate) reveal consent (Slice 5b). Absent until the
// employer requests a reveal. `expired` is NOT stored — it is derived on read
// (status 'requested' + past expiresAt). granted/declined are terminal.
const consentSchema = new Schema({
  status: { type: String, enum: ['requested', 'granted', 'declined'], required: true },
  requestedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  respondedAt: { type: Date, default: null },
  remindedAt: { type: Date, default: null },
}, { _id: false });

// Per-(employer × drive × candidate) offer (Slice 9). Absent until the
// employer records a first offer action.
const offerSchema = new Schema({
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Joined'], required: true },
  response: { type: String, enum: ['Pending', 'Negotiating', 'Accepted', 'Declined'], default: 'Pending' },
  ctc: { type: Number, default: 0 },
  location: { type: String, default: '' },
  mode: { type: String, enum: ['On-site', 'Hybrid', 'Remote'], default: 'Hybrid' },
  joinDate: { type: Date, default: null },
  declineReason: { type: String, default: '' },
}, { _id: false });

// Net-new per-(employer × drive × candidate) join. Sparse: a row exists only
// once the employer acts on a candidate (a decision or a note). Later slices
// extend this same doc (consent sub-state → 5b, kanban stage → 8, offer → 9).
const applicationSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  jobseekerId: { type: Schema.Types.ObjectId, ref: 'Jobseeker', required: true },
  decision: { type: String, enum: ['Shortlisted', 'Hold', 'Rejected'], default: null },
  notes: { type: [noteSchema], default: [] },
  consent: { type: consentSchema, default: undefined },
  stage: {
    type: String,
    enum: [...KANBAN_STAGES],
    default: null,
  },
  offer: { type: offerSchema, default: undefined },
}, { timestamps: true });

applicationSchema.index({ employerId: 1, driveId: 1, jobseekerId: 1 }, { unique: true });

export type ApplicationDoc = InferSchemaType<typeof applicationSchema>;
export const Application = model('Application', applicationSchema);
