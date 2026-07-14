import { Schema, model, Types, type InferSchemaType } from 'mongoose';

export type JobseekerStage =
  | 'Applied' | 'Screened' | 'Evaluated' | 'MatchReady'
  | 'Shortlisted' | 'Offer' | 'Joined' | 'DroppedOff';

export const JOBSEEKER_STAGES: JobseekerStage[] = [
  'Applied', 'Screened', 'Evaluated', 'MatchReady',
  'Shortlisted', 'Offer', 'Joined', 'DroppedOff',
];

const jobseekerSchema = new Schema({
  name: { type: String, required: true },
  instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true },
  branch: { type: String, required: true },
  gradYear: { type: Number, required: true },
  cgpa: { type: Number, required: true },
  source: { type: String, required: true },
  profileCompleted: { type: Boolean, default: false },
  evaluationStatus: { type: String, enum: ['na', 'pending', 'completed'], default: 'na' },
  stage: { type: String, enum: JOBSEEKER_STAGES, default: 'Applied' },
  createdAt: { type: Date, default: Date.now },
});

export type JobseekerDoc = InferSchemaType<typeof jobseekerSchema>;
export const Jobseeker = model('Jobseeker', jobseekerSchema);
export { Types };
