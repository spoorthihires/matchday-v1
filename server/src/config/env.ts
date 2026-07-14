import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/matchday'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-me'),
  JWT_EXPIRES: z.string().default('1d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
