import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

export const DATA_DIR = path.join(process.cwd(), 'data');
export const CHAT_DIR = path.join(DATA_DIR, 'chat');
export const SHARE_DIR = path.join(CHAT_DIR, 'sharechat');
export const LLM_DIR = path.join(DATA_DIR, 'llm');
export const LLM_API_DIR = path.join(LLM_DIR, 'api');
export const TEMP_DIR = path.join(DATA_DIR, 'temp');
export const TEMP_FILE_DIR = path.join(TEMP_DIR, 'file');
export const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
export const PYTHON_RUNTIME_DIR = path.join(RUNTIME_DIR, 'python');
export const USER_DIR = path.join(DATA_DIR, 'user');
export const MEMORY_DIR = path.join(USER_DIR, 'memories');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const DATA_DIRECTORIES = [
  DATA_DIR,
  CHAT_DIR,
  SHARE_DIR,
  LLM_DIR,
  LLM_API_DIR,
  TEMP_DIR,
  TEMP_FILE_DIR,
  RUNTIME_DIR,
  PYTHON_RUNTIME_DIR,
  USER_DIR,
  MEMORY_DIR,
  BACKUP_DIR
];

export const ensureDataDirectoriesSync = () => {
  for (const directory of DATA_DIRECTORIES) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

export const ensureDataDirectories = async () => {
  await Promise.all(DATA_DIRECTORIES.map(directory => fsp.mkdir(directory, { recursive: true })));
};
