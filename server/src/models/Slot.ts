import { Schema, model, type InferSchemaType } from 'mongoose';

const slotSchema = new Schema({
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null },
  date: { type: Date, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  capacity: { type: Number, default: 10 },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled'], default: 'Scheduled' },
  link: { type: String, default: '' },
  attended: { type: Number, default: 0 },
  noShow: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export type SlotDoc = InferSchemaType<typeof slotSchema>;
export const Slot = model('Slot', slotSchema);
