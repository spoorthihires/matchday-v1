import { Schema, model, type InferSchemaType } from 'mongoose';

const slotBookingSchema = new Schema({
  slotId: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
  jobseekerId: { type: Schema.Types.ObjectId, ref: 'Jobseeker', required: true },
  status: { type: String, enum: ['Booked', 'Held'], required: true },
  createdAt: { type: Date, default: Date.now },
});
slotBookingSchema.index({ slotId: 1, jobseekerId: 1 }, { unique: true });

export type SlotBookingDoc = InferSchemaType<typeof slotBookingSchema>;
export const SlotBooking = model('SlotBooking', slotBookingSchema);
