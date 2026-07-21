import { Schema, model, type InferSchemaType } from 'mongoose';

// Employer-scheduled interview for a consent-granted candidate, attached to one of the
// employer's Slots (Slice 4). Distinct from SlotBooking (the candidate-side reservation).
// The meeting link is NOT stored — it derives from the slot's `link` on read.
const interviewSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  jobseekerId: { type: Schema.Types.ObjectId, ref: 'Jobseeker', required: true },
  slotId: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
  time: { type: String, required: true },                 // 'HH:MM' within the slot window
  interviewers: { type: [String], default: [] },          // free-text (no team entity yet)
  status: { type: String, enum: ['Scheduled', 'Confirmed', 'Cancelled', 'Completed'], default: 'Scheduled' },
}, { timestamps: true });

interviewSchema.index({ employerId: 1, driveId: 1, jobseekerId: 1 }, { unique: true });

export type InterviewDoc = InferSchemaType<typeof interviewSchema>;
export const Interview = model('Interview', interviewSchema);
