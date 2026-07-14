import { Schema, model, type InferSchemaType } from 'mongoose';

const evaluationStageSchema = new Schema({
  key: { type: String, enum: ['mcq', 'coding', 'tara', 'assignments'], required: true },
  enabled: { type: Boolean, default: false },
  config: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const driveSchema = new Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true },
  stream: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Published', 'Draft', 'Archived'], default: 'Draft' },
  candType: { type: String, enum: ['Freshers', 'Experienced', 'Both'], default: 'Freshers' },
  mode: { type: String, enum: ['Online', 'Onsite', 'Hybrid'], default: 'Hybrid' },
  frequency: { type: String, enum: ['Weekly', 'Bi-weekly', 'Monthly', 'One-time'], default: 'One-time' },
  eventDay: { type: String, enum: ['Wednesday', 'Saturday'], default: 'Wednesday' },
  eventDate: { type: Date },                 // legacy, removed in Task 4
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
  visibility: {
    employerReg: { type: String, enum: ['Open', 'Invite-only', 'Closed'], default: 'Invite-only' },
    instituteVis: { type: String, enum: ['All institutes', 'Selected institutes', 'Private link'], default: 'Selected institutes' },
    candidateAccess: { type: String, enum: ['Public', 'Eligible only', 'Invite'], default: 'Eligible only' },
  },
  createdBy: { type: String, default: 'Platform Admin' },
}, { timestamps: true });

export type DriveDoc = InferSchemaType<typeof driveSchema>;
export const Drive = model('Drive', driveSchema);
