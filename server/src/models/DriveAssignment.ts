import { Schema, model, type InferSchemaType } from 'mongoose';

const driveAssignmentSchema = new Schema({
  instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true },
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  createdAt: { type: Date, default: Date.now },
});
driveAssignmentSchema.index({ instituteId: 1, driveId: 1 }, { unique: true });

export type DriveAssignmentDoc = InferSchemaType<typeof driveAssignmentSchema>;
export const DriveAssignment = model('DriveAssignment', driveAssignmentSchema);
