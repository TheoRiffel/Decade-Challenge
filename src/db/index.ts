import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

export const client = postgres(config.databaseUrl, { prepare: false });
export const db = drizzle(client, { schema });
export type DB = typeof db;
