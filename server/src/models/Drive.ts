import { Schema, model, type InferSchemaType } from 'mongoose';

const evaluationStageSchema = new Schema({
  key: { type: String, enum: ['mcq', 'coding', 'tara', 'assignments'], required: true },
  enabled: { type: Boolean, default: false },
  config: { type: Schema.Types.Mixed, default: {} },
  evalConfigId: { type: Schema.Types.ObjectId, ref: 'EvalConfig', default: null },
}, { _id: false });

const driveSchema = new Schema({
  // Not `required` at the persistence layer: Drafts may be saved incomplete
  // (spec §11). The Zod schemas (drives.schemas.ts) are the source of truth
  // for requiredness — createDriveSchema enforces non-empty values on the
  // Published/Active path, draftDriveSchema relaxes them for Draft saves.
  name: { type: String, default: '' },
  domain: { type: String, default: '' },
  stream: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Published', 'Draft', 'Archived'], default: 'Draft' },
  candType: { type: String, enum: ['Freshers', 'Experienced', 'Both'], default: 'Freshers' },
  mode: { type: String, enum: ['Online', 'Onsite', 'Hybrid'], default: 'Hybrid' },
  frequency: { type: String, enum: ['Weekly', 'Bi-weekly', 'Monthly', 'One-time'], default: 'One-time' },
  eventDay: { type: String, enum: ['Wednesday', 'Saturday'], default: 'Wednesday' },
  eventDates: { type: [Date], default: [] },
  candCap: { type: Number, default: 0 },
  empCap: { type: Number, default: 0 },
  slotCap: { type: Number, default: 0 },
  eligibility: {
    sources: { type: [String], default: [] },
    branches: { type: [String], default: [] },
    gradYears: { type: [Number], default: [] },
    expType: { type: String, default: 'Freshers only' },
  },
  evaluation: { type: [evaluationStageSchema], default: [] },
  templateId: { type: Schema.Types.ObjectId, ref: 'DriveTemplate', default: null },
  streamId: { type: Schema.Types.ObjectId, ref: 'Stream', default: null },
  visibility: {
    employerReg: { type: String, enum: ['Open', 'Invite-only', 'Closed'], default: 'Invite-only' },
    instituteVis: { type: String, enum: ['All institutes', 'Selected institutes', 'Private link'], default: 'Selected institutes' },
    candidateAccess: { type: String, enum: ['Public', 'Eligible only', 'Invite'], default: 'Eligible only' },
  },
  createdBy: { type: String, default: 'Platform Admin' },
}, { timestamps: true });

export type DriveDoc = InferSchemaType<typeof driveSchema>;
export const Drive = model('Drive', driveSchema);
