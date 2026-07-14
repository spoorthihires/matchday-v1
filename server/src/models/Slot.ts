import { Schema, model, type InferSchemaType } from 'mongoose';

const slotSchema = new Schema({
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null },
  date: { type: Date, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  status: { type: String, enum: ['booked', 'held', 'available'], default: 'available' },
  createdAt: { type: Date, default: Date.now },
});

export type SlotDoc = InferSchemaType<typeof slotSchema>;
export const Slot = model('Slot', slotSchema);
