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

const detailsSchema = new Schema({
  roleDescription: { type: String, default: '' },
  deadline: { type: String, default: '' }, urgency: { type: String, default: '' },
  goodToHave: { type: [String], default: [] }, qualification: { type: String, default: '' },
  gradYearFrom: { type: Number, default: null }, gradYearTo: { type: Number, default: null },
  expMin: { type: Number, default: null }, expMax: { type: Number, default: null },
  ctcMin: { type: Number, default: null }, ctcMax: { type: Number, default: null },
  stipend: { type: Number, default: null }, cities: { type: [String], default: [] },
  workMode: { type: String, default: '' }, officeLocation: { type: String, default: '' },
  rounds: { type: Number, default: null }, roundNames: { type: String, default: '' },
  preferredWednesday: { type: String, default: '' }, timeSlot: { type: String, default: '' },
  minEvalScore: { type: Number, default: null }, mandatorySkills: { type: [String], default: [] },
}, { _id: false });

const registrationSchema = new Schema({
  company: { type: String, required: true },
  industry: { type: String, required: true },
  role: { type: String, required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null },
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
  details: { type: detailsSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
});

export type RegistrationDoc = InferSchemaType<typeof registrationSchema>;
export const RegistrationRequest = model('RegistrationRequest', registrationSchema);
