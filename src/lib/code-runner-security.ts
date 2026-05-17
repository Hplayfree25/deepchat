import { tmpdir } from 'os';

export const codeRunnerLimits = {
  batchTimeoutMs: 8000,
  compileTimeoutMs: 15000
};

export const normalizeRunnerInput = (input?: string) => (
  typeof input === 'string'
    ? input.replace(/\r\n/g, '\n')
    : ''
);

export const normalizeRunnerOutput = (value: string) => value.replace(/\r\n/g, '\n');

export const compactRunnerOutput = normalizeRunnerOutput;
export const truncateRunnerOutput = normalizeRunnerOutput;

export const getRunnerEnvironment = (patch: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: process.env.PATH || process.env.Path || '',
  Path: process.env.Path || process.env.PATH || '',
  TEMP: process.env.TEMP || tmpdir(),
  TMP: process.env.TMP || tmpdir(),
  PYTHONIOENCODING: 'utf-8',
  PYTHONUNBUFFERED: '1',
  PYTHONNOUSERSITE: '1',
  NODE_NO_WARNINGS: '1',
  ...patch
});
