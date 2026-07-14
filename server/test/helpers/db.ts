import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

export async function setupTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function teardownTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
}

export async function clearDb(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
