import { Schema, model, type InferSchemaType } from 'mongoose';

export const TEAM_ROLES = ['Admin', 'Recruiter', 'Interviewer', 'Viewer'] as const;
export const TEAM_STATUSES = ['Active', 'Disabled'] as const;

const teamMemberSchema = new Schema({
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, default: undefined },
  role: { type: String, enum: TEAM_ROLES, default: 'Recruiter' },
  status: { type: String, enum: TEAM_STATUSES, default: 'Active' },
  createdAt: { type: Date, default: Date.now },
});
teamMemberSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } });
teamMemberSchema.set('toObject', { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } });

export type TeamMemberDoc = InferSchemaType<typeof teamMemberSchema>;
export const TeamMember = model('TeamMember', teamMemberSchema);
