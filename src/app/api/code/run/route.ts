import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { tmpdir } from 'os';
import { NextResponse } from 'next/server';
import { codeNeedsConsoleInput, codeUsesEcmaModules, normalizeCodeLanguage } from '@/lib/code-runner-detection';
import {
  codeRunnerLimits,
  compactRunnerOutput,
  getRunnerEnvironment,
  normalizeRunnerInput,
  truncateRunnerOutput
} from '@/lib/code-runner-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RunPayload = {
  language?: string;
  code?: string;
  input?: string;
};

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
};

type RunnerConfig = {
  extension: string | ((code: string) => string);
  command: string;
  args: (filePath: string, workDir: string) => string[];
  prepare?: (code: string, filePath: string, workDir: string) => Promise<string>;
  fileName?: (code: string) => string;
};

const normalizeLanguage = (language = '') => normalizeCodeLanguage(language);

const getBashCommand = () => {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
  ];
  return candidates.find((candidate) => existsSync(candidate)) || 'bash';
};

const getMessage = (error: unknown) => (
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Unknown runner error'
);

const getProcessErrorMessage = (command: string, error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    return `Runtime not available in this sandbox: ${command}`;
  }
  return getMessage(error);
};

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
    extension: 'js',
    command: 'node',
    prepare: async (code) => transpileTypeScript(code),
    args: (filePath) => [filePath]
  },
  ts: {
    extension: 'js',
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
    args: (filePath) => [filePath]
  },
  rust: {
    extension: 'rs',
    command: 'rustc',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, process.platform === 'win32' ? 'main.exe' : 'main')]
  },
  c: {
    extension: 'c',
    command: 'gcc',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, 'main.exe')]
  },
  cpp: {
    extension: 'cpp',
    command: 'g++',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, 'main.exe')]
  },
  'c++': {
    extension: 'cpp',
    command: 'g++',
    args: (filePath, workDir) => [filePath, '-o', join(workDir, 'main.exe')]
  }
};

const executeProcess = (command: string, args: string[], cwd: string, signal: AbortSignal, input = ''): Promise<RunResult> => new Promise((resolve) => {
  const start = performance.now();
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    env: getRunnerEnvironment()
  });

  let stdout = '';
  let stderr = '';
  let settled = false;
  let timedOut = false;

  const finish = (exitCode: number | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abortRun);
    resolve({
      stdout: truncateRunnerOutput(compactRunnerOutput(stdout)),
      stderr: truncateRunnerOutput(compactRunnerOutput(stderr)),
      exitCode,
      timedOut,
      durationMs: performance.now() - start
    });
  };

  const abortRun = () => {
    child.kill('SIGKILL');
    finish(null);
  };

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, codeRunnerLimits.batchTimeoutMs);

  signal.addEventListener('abort', abortRun);

  child.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString('utf8');
  });

  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString('utf8');
  });

  child.on('error', (error) => {
    stderr += getProcessErrorMessage(command, error);
    finish(null);
  });

  child.on('close', (code) => finish(code));

  if (input) {
    child.stdin?.write(input.endsWith('\n') ? input : `${input}\n`);
  }
  child.stdin?.end();
});

const runCompiledOutput = async (language: string, workDir: string, filePath: string, result: RunResult, signal: AbortSignal, input: string) => {
  if (result.exitCode !== 0 || result.timedOut) return result;

  if (language === 'java') {
    const className = basename(filePath, '.java');
    const runResult = await executeProcess('java', ['-cp', workDir, className], workDir, signal, input);
    return {
      ...runResult,
      stdout: `${result.stdout}${runResult.stdout}`,
      stderr: `${result.stderr}${runResult.stderr}`
    };
  }

  if (language === 'c' || language === 'cpp' || language === 'c++') {
    const executable = join(workDir, 'main.exe');
    const runResult = await executeProcess(executable, [], workDir, signal, input);
    return {
      ...runResult,
      stdout: `${result.stdout}${runResult.stdout}`,
      stderr: `${result.stderr}${runResult.stderr}`
    };
  }

  if (language === 'rust') {
    const executable = join(workDir, process.platform === 'win32' ? 'main.exe' : 'main');
    const runResult = await executeProcess(executable, [], workDir, signal, input);
    return {
      ...runResult,
      stdout: `${result.stdout}${runResult.stdout}`,
      stderr: `${result.stderr}${runResult.stderr}`
    };
  }

  return result;
};

export async function POST(req: Request) {
  let workDir = '';

  try {
    const { language, code, input } = await req.json() as RunPayload;
    const normalizedLanguage = normalizeLanguage(language);
    const normalizedInput = normalizeRunnerInput(input);

    if (!normalizedLanguage || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing language or code' }, { status: 400 });
    }

    if (codeNeedsConsoleInput(normalizedLanguage, code) && !normalizedInput.trim()) {
      return NextResponse.json({ error: 'This code needs console input before it can run.', needsInput: true }, { status: 422 });
    }

    const runner = runners[normalizedLanguage];
    if (!runner) {
      return NextResponse.json({
        error: `No runner is configured for ${normalizedLanguage}.`,
        supportedLanguages: Object.keys(runners).sort()
      }, { status: 400 });
    }

    workDir = join(tmpdir(), `deepchat-run-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });

    const extension = typeof runner.extension === 'function' ? runner.extension(code) : runner.extension;
    const fileName = runner.fileName ? runner.fileName(code) : `main.${extension}`;
    const filePath = join(workDir, fileName);
    const preparedCode = runner.prepare ? await runner.prepare(code, filePath, workDir) : code;
    await writeFile(filePath, preparedCode, 'utf8');

    const result = await executeProcess(runner.command, runner.args(filePath, workDir), workDir, req.signal, normalizedInput);
    const finalResult = await runCompiledOutput(normalizedLanguage, workDir, filePath, result, req.signal, normalizedInput);

    return NextResponse.json({
      success: finalResult.exitCode === 0 && !finalResult.timedOut,
      language: normalizedLanguage,
      stdout: truncateRunnerOutput(compactRunnerOutput(finalResult.stdout)),
      stderr: finalResult.timedOut ? `${truncateRunnerOutput(compactRunnerOutput(finalResult.stderr))}\nProcess timed out after ${codeRunnerLimits.batchTimeoutMs}ms`.trim() : truncateRunnerOutput(compactRunnerOutput(finalResult.stderr)),
      exitCode: finalResult.exitCode,
      timedOut: finalResult.timedOut,
      durationMs: Math.round(finalResult.durationMs)
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getMessage(error) }, { status: 500 });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
