import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { DATA_DIR, ensureDataDirectoriesSync } from '@/lib/data-directories';

const DB_FILE = path.join(DATA_DIR, 'deepchat.sqlite');

let sqlite: Database.Database | null = null;
let orm: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getSqlite = () => {
  if (!sqlite) {
    ensureDataDirectoriesSync();
    sqlite = new Database(DB_FILE);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
  }
  return sqlite;
};

export const getDb = () => {
  if (!orm) {
    orm = drizzle(getSqlite(), { schema });
  }
  return orm;
};

export const getDbFilePath = () => DB_FILE;
