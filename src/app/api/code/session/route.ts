import { randomUUID } from 'crypto';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { tmpdir } from 'os';
import { NextResponse } from 'next/server';
import { codeUsesEcmaModules, normalizeCodeLanguage } from '@/lib/code-runner-detection';
import { codeRunnerLimits, compactRunnerOutput, getRunnerEnvironment, truncateRunnerOutput } from '@/lib/code-runner-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SessionPayload = {
  action?: string;
  sessionId?: string;
  language?: string;
  code?: string;
  input?: string;
};

type RunnerConfig = {
  extension: string | ((code: string) => string);
  command: string;
  args: (filePath: string, workDir: string) => string[];
  prepare?: (code: string) => Promise<string>;
  fileName?: (code: string) => string;
  runAfterCompile?: (filePath: string, workDir: string) => { command: string; args: string[] };
};

type CodeSession = {
  child: ChildProcessWithoutNullStreams | null;
  workDir: string;
  output: { type: string; text: string }[];
  ended: boolean;
  exitCode: number | null;
};

declare global {
  var deepchatCodeSessions: Map<string, CodeSession> | undefined;
}

const sessions = globalThis.deepchatCodeSessions || new Map<string, CodeSession>();
globalThis.deepchatCodeSessions = sessions;

const getBashCommand = () => {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
  ];
  return candidates.find((candidate) => existsSync(candidate)) || 'bash';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const transpileTypeScript = async (code: string) => {
  const ts = await import('typescript');
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: false
    }
  }).outputText;
};

const runners: Record<string, RunnerConfig> = {
  javascript: {
    extension: (code) => codeUsesEcmaModules(code) ? 'mjs' : 'cjs',
    command: 'node',
    args: (filePath) => [filePath]
  },
  js: {
    extension: (code) => codeUsesEcmaModules(code) ? 'mjs' : 'cjs',
    command: 'node',
    args: (filePath) => [filePath]
  },
  typescript: {
    extension: 'cjs',
    command: 'node',
    prepare: async (code) => transpileTypeScript(code),
    args: (filePath) => [filePath]
  },
  ts: {
    extension: 'cjs',
    command: 'node',
    prepare: async (code) => transpileTypeScript(code),
    args: (filePath) => [filePath]
  },
  python: {
    extension: 'py',
    command: 'python',
    args: (filePath) => [filePath]
  },
  py: {
    extension: 'py',
    command: 'python',
    args: (filePath) => [filePath]
  },
  php: {
    extension: 'php',
    command: 'php',
    args: (filePath) => [filePath]
  },
  bash: {
    extension: 'sh',
    command: getBashCommand(),
    args: (filePath) => [filePath]
  },
  shell: {
    extension: 'sh',
    command: getBashCommand(),
    args: (filePath) => [filePath]
  },
  sh: {
    extension: 'sh',
    command: getBashCommand(),
    args: (filePath) => [filePath]
  },
  powershell: {
    extension: 'ps1',
    command: 'powershell',
    args: (filePath) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', filePath]
  },
  ps1: {
    extension: 'ps1',
    command: 'powershell',
    args: (filePath) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', filePath]
  },
  ruby: {
    extension: 'rb',
    command: 'ruby',
    args: (filePath) => [filePath]
  },
  rb: {
    extension: 'rb',
    command: 'ruby',
    args: (filePath) => [filePath]
  },
  go: {
    extension: 'go',
    command: 'go',
    args: (filePath) => ['run', filePath]
  },
  java: {
    extension: 'java',
    command: 'javac',
    fileName: (code) => `${code.match(/\bpublic\s+class\s+([A-Za-z_$][\w$]*)/)?.[1] || 'Main'}.java`,
    args: (filePath) => [filePath],
    runAfterCompile: (filePath, workDir) => ({ command: 'java', args: ['-cp', workDir, basename(filePath, '.java')] })
  },
  rust: {
    extension: 'rs',
    command: 'rustc',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, process.platform === 'win32' ? 'main.exe' : 'main')],
    runAfterCompile: (_filePath, workDir) => ({ command: join(workDir, process.platform === 'win32' ? 'main.exe' : 'main'), args: [] })
  },
  c: {
    extension: 'c',
    command: 'gcc',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, 'main.exe')],
    runAfterCompile: (_filePath, workDir) => ({ command: join(workDir, 'main.exe'), args: [] })
  },
  cpp: {
    extension: 'cpp',
    command: 'g++',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, 'main.exe')],
    runAfterCompile: (_filePath, workDir) => ({ command: join(workDir, 'main.exe'), args: [] })
  },
  'c++': {
    extension: 'cpp',
    command: 'g++',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, 'main.exe')],
    runAfterCompile: (_filePath, workDir) => ({ command: join(workDir, 'main.exe'), args: [] })
  }
};

const processErrorMessage = (command: string, error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    return `Runtime not available in this sandbox: ${command}`;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unknown runner error';
};

const drain = (session: CodeSession) => {
  const output = session.output;
  session.output = [];
  return output;
};

const closeSession = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  session.child?.kill('SIGKILL');
  await rm(session.workDir, { recursive: true, force: true }).catch(() => undefined);
};

const runOnce = (command: string, args: string[], cwd: string) => new Promise<{ success: boolean; output: { type: string; text: string }[] }>((resolve) => {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    env: getRunnerEnvironment()
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (success: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve({
      success,
      output: [
        ...(stdout ? [{ type: 'log', text: truncateRunnerOutput(compactRunnerOutput(stdout)) }] : []),
        ...(stderr ? [{ type: 'error', text: truncateRunnerOutput(compactRunnerOutput(stderr)) }] : [])
      ]
    });
  };
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    stderr += `\nCompile timed out after ${codeRunnerLimits.compileTimeoutMs}ms`;
  }, codeRunnerLimits.compileTimeoutMs);
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString('utf8');
  });
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString('utf8');
  });
  child.on('error', (error) => {
    stderr += processErrorMessage(command, error);
    finish(false);
  });
  child.on('close', (code) => finish(code === 0));
  child.stdin.end();
});

const start = async (payload: SessionPayload) => {
  const language = normalizeCodeLanguage(payload.language);
  const code = typeof payload.code === 'string' ? payload.code : '';

  if (!language || !code) {
    return NextResponse.json({ error: 'Missing language or code' }, { status: 400 });
  }

  const runner = runners[language];
  if (!runner) {
    return NextResponse.json({ error: `No runner is configured for ${language}.`, supportedLanguages: Object.keys(runners).sort() }, { status: 400 });
  }

  const sessionId = randomUUID();
  const workDir = join(tmpdir(), `deepchat-session-${sessionId}`);
  await mkdir(workDir, { recursive: true });

  const extension = typeof runner.extension === 'function' ? runner.extension(code) : runner.extension;
  const fileName = runner.fileName ? runner.fileName(code) : `main.${extension}`;
  const filePath = join(workDir, fileName);
  const preparedCode = runner.prepare ? await runner.prepare(code) : code;
  await writeFile(filePath, preparedCode, 'utf8');

  let command = runner.command;
  let args = runner.args(filePath, workDir);

  if (runner.runAfterCompile) {
    const compileResult = await runOnce(command, args, workDir);
    if (!compileResult.success) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      return NextResponse.json({ sessionId, output: compileResult.output, ended: true, exitCode: 1 });
    }
    const runStage = runner.runAfterCompile(filePath, workDir);
    command = runStage.command;
    args = runStage.args;
  }

  const session: CodeSession = {
    child: null,
    workDir,
    output: [],
    ended: false,
    exitCode: null
  };

  const child = spawn(command, args, {
    cwd: workDir,
    shell: false,
    windowsHide: true,
    env: getRunnerEnvironment()
  });

  session.child = child;

  const pushOutput = (type: string, text: string) => {
    if (session.ended) return;
    session.output.push({ type, text: truncateRunnerOutput(compactRunnerOutput(text)) });
  };

  child.stdout.on('data', (data: Buffer) => {
    pushOutput('log', data.toString('utf8'));
  });
  child.stderr.on('data', (data: Buffer) => {
    pushOutput('error', data.toString('utf8'));
  });
  child.on('error', (error) => {
    session.output.push({ type: 'error', text: processErrorMessage(command, error) });
    session.ended = true;
  });
  child.on('close', (code) => {
    session.exitCode = code;
    session.ended = true;
  });

  sessions.set(sessionId, session);
  await sleep(180);
  const output = drain(session);
  return NextResponse.json({ sessionId, output, ended: session.ended, exitCode: session.exitCode });
};

const input = async (payload: SessionPayload) => {
  const session = payload.sessionId ? sessions.get(payload.sessionId) : null;
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const value = typeof payload.input === 'string' ? payload.input : '';
  if (!session.ended) session.child?.stdin.write(`${value}\n`);
  await sleep(160);
  const output = drain(session);
  if (session.ended) await closeSession(payload.sessionId || '');
  return NextResponse.json({ output, ended: session.ended, exitCode: session.exitCode });
};

const read = async (payload: SessionPayload) => {
  const session = payload.sessionId ? sessions.get(payload.sessionId) : null;
  if (!session) return NextResponse.json({ output: [], ended: true, exitCode: null });
  const output = drain(session);
  if (session.ended) await closeSession(payload.sessionId || '');
  return NextResponse.json({ output, ended: session.ended, exitCode: session.exitCode });
};

const stop = async (payload: SessionPayload) => {
  if (payload.sessionId) await closeSession(payload.sessionId);
  return NextResponse.json({ output: [{ type: 'system', text: 'Run stopped' }], ended: true, exitCode: null });
};

export async function POST(req: Request) {
  try {
    const payload = await req.json() as SessionPayload;
    if (payload.action === 'start') return start(payload);
    if (payload.action === 'input') return input(payload);
    if (payload.action === 'read') return read(payload);
    if (payload.action === 'stop') return stop(payload);
    return NextResponse.json({ error: 'Unknown session action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: processErrorMessage('runner', error) }, { status: 500 });
  }
}
