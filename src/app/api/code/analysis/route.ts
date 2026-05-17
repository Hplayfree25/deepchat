import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readdir, rm, stat, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, delimiter, join, normalize, sep } from 'path';
import { NextResponse } from 'next/server';
import { getRunnerEnvironment } from '@/lib/code-runner-security';
import { excelFormulaEngineSource } from './excel-formula-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AttachedFileInput = {
  name?: unknown;
  ext?: unknown;
};

type AnalysisPayload = {
  chatId?: unknown;
  prompt?: unknown;
  code?: unknown;
  displayCode?: unknown;
  requestedCharts?: unknown;
  analysisMode?: unknown;
  files?: AttachedFileInput[];
};

const ANALYSIS_ROOT = join(tmpdir(), 'deepchat', 'analysis');
const TEMP_FILE_ROOT = join(process.cwd(), 'data', 'temp', 'file');
const RUNTIME_ROOT = join(tmpdir(), 'deepchat', 'runtime', 'python');
const RUNTIME_VENV_DIR = join(RUNTIME_ROOT, 'venv');
const RUNTIME_CACHE_DIR = join(RUNTIME_ROOT, 'cache');
const RUNTIME_TMP_DIR = join(RUNTIME_ROOT, 'tmp');
const RUNTIME_VENV_BIN = process.platform === 'win32' ? join(RUNTIME_VENV_DIR, 'Scripts') : join(RUNTIME_VENV_DIR, 'bin');
const RUNTIME_VENV_PYTHON = process.platform === 'win32' ? join(RUNTIME_VENV_BIN, 'python.exe') : join(RUNTIME_VENV_BIN, 'python');
const RESULT_MARKER = '__DEEPCHAT_ANALYSIS_RESULT__';
const DATA_EXTENSIONS = new Set(['csv', 'json', 'jsonl', 'xlsx', 'xls']);
const PYTHON_IMPORTS = ['pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'openpyxl', 'sklearn', 'scipy', 'statsmodels', 'PIL', 'pyarrow', 'xlsxwriter'];
const PIP_PACKAGES = ['pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'openpyxl', 'scikit-learn', 'scipy', 'statsmodels', 'pillow', 'pyarrow', 'xlsxwriter'];
const ANALYSIS_TTL_MS = 72 * 60 * 60 * 1000;
const ANALYSIS_MAX_RUNS = 80;

let pythonStackReady = false;
let pythonSpreadsheetStackReady = false;
let pythonCashflowStackReady = false;

const getMessage = (error: unknown) => (
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Unknown analysis error'
);

const normalizeExt = (file: AttachedFileInput) => {
  const ext = typeof file.ext === 'string' ? file.ext.toLowerCase().replace(/^\./, '') : '';
  return ext || 'other';
};

const resolveAttachedFile = async (file: AttachedFileInput) => {
  const name = typeof file.name === 'string' ? file.name : '';
  const ext = normalizeExt(file);
  if (!name || !DATA_EXTENSIONS.has(ext)) return null;
  const root = normalize(TEMP_FILE_ROOT + sep);
  const filePath = normalize(join(TEMP_FILE_ROOT, ext, name));
  if (!filePath.toLowerCase().startsWith(root.toLowerCase())) return null;
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) return null;
  return {
    name,
    ext,
    path: filePath,
    size: fileStat.size
  };
};

const cleanupAnalysisWorkspace = async (keepRunId = '') => {
  await mkdir(ANALYSIS_ROOT, { recursive: true });
  const entries = await readdir(ANALYSIS_ROOT, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(entries.filter(entry => entry.isDirectory()).map(async (entry) => {
    const runPath = normalize(join(ANALYSIS_ROOT, entry.name));
    const info = await stat(runPath).catch(() => null);
    return info ? { name: entry.name, path: runPath, mtimeMs: info.mtimeMs } : null;
  }));
  const validRuns = runs.filter((run): run is { name: string; path: string; mtimeMs: number } => Boolean(run));
  const now = Date.now();
  const expired = validRuns.filter(run => run.name !== keepRunId && now - run.mtimeMs > ANALYSIS_TTL_MS);
  const overflow = validRuns
    .filter(run => run.name !== keepRunId)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(ANALYSIS_MAX_RUNS);
  const targets = new Map([...expired, ...overflow].map(run => [run.path, run]));
  await Promise.allSettled([...targets.values()].map(run => rm(run.path, { recursive: true, force: true })));
};

const getArtifactUrl = (runId: string, artifactName: string, download = false) => {
  const params = new URLSearchParams({ runId, name: artifactName });
  if (download) params.set('download', '1');
  return `/api/code/analysis/artifact?${params.toString()}`;
};

const getRuntimeEnv = (tempDir = RUNTIME_TMP_DIR): Partial<NodeJS.ProcessEnv> => {
  const pathValue = [RUNTIME_VENV_BIN, process.env.PATH || process.env.Path || ''].filter(Boolean).join(delimiter);
  return {
    VIRTUAL_ENV: RUNTIME_VENV_DIR,
    PATH: pathValue,
    Path: pathValue,
    TEMP: tempDir,
    TMP: tempDir,
    PYTHONPYCACHEPREFIX: join(tempDir, 'pycache'),
    MPLCONFIGDIR: join(tempDir, 'matplotlib'),
    XDG_CACHE_HOME: join(tempDir, 'cache'),
    PIP_CACHE_DIR: join(RUNTIME_CACHE_DIR, 'pip')
  };
};

const runProcess = (command: string, args: string[], cwd: string, input = '', timeoutMs = 300000, envPatch: Partial<NodeJS.ProcessEnv> = {}) => new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    env: getRunnerEnvironment(envPatch)
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (exitCode: number | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve({ stdout, stderr, exitCode });
  };
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    stderr += `Process timed out after ${timeoutMs}ms`;
    finish(null);
  }, timeoutMs);
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString('utf8');
  });
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString('utf8');
  });
  child.on('error', (error) => {
    stderr += getMessage(error);
    finish(null);
  });
  child.on('close', (code) => finish(code));
  if (input) child.stdin.write(input);
  child.stdin.end();
});

const getBasePythonCommand = () => {
  const candidates = [
    process.env.DEEPCHAT_PYTHON,
    join(process.env.USERPROFILE || '', 'miniconda3', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    'python'
  ].filter((item): item is string => Boolean(item));
  return candidates.find(candidate => candidate === 'python' || existsSync(candidate)) || 'python';
};

type PythonRuntimeMode = 'excel_light' | 'table' | 'chart' | 'analysis';

const MODE_IMPORTS: Record<PythonRuntimeMode, string[]> = {
  excel_light: ['openpyxl'],
  table: ['pandas', 'numpy', 'openpyxl'],
  chart: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'openpyxl'],
  analysis: PYTHON_IMPORTS
};

const MODE_PACKAGES: Record<PythonRuntimeMode, string[]> = {
  excel_light: ['openpyxl'],
  table: ['pandas', 'numpy', 'openpyxl'],
  chart: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'openpyxl'],
  analysis: PIP_PACKAGES
};

const pythonReadyModes = new Set<PythonRuntimeMode>();

const normalizeRuntimeMode = (value: unknown): PythonRuntimeMode => {
  if (value === 'excel_light' || value === 'table' || value === 'chart' || value === 'analysis') return value;
  return 'analysis';
};

const ensurePythonDataStack = async (cwd: string, mode: PythonRuntimeMode = 'analysis') => {
  await mkdir(RUNTIME_ROOT, { recursive: true });
  await mkdir(RUNTIME_CACHE_DIR, { recursive: true });
  await mkdir(RUNTIME_TMP_DIR, { recursive: true });

  if (!existsSync(RUNTIME_VENV_PYTHON)) {
    const basePython = getBasePythonCommand();
    const createVenv = await runProcess(basePython, ['-m', 'venv', RUNTIME_VENV_DIR], RUNTIME_ROOT, '', 300000, getRuntimeEnv(RUNTIME_TMP_DIR));
    if (createVenv.exitCode !== 0 || !existsSync(RUNTIME_VENV_PYTHON)) {
      throw new Error(createVenv.stderr || createVenv.stdout || 'Failed to create the isolated Python runtime.');
    }
  }

  const python = RUNTIME_VENV_PYTHON;
  if (pythonReadyModes.has(mode) || pythonStackReady || ((mode === 'table' || mode === 'excel_light') && pythonSpreadsheetStackReady) || (mode === 'excel_light' && pythonCashflowStackReady)) return python;
  const requiredImports = MODE_IMPORTS[mode];
  const requiredPackages = MODE_PACKAGES[mode];
  const importCode = [
    'import importlib, json',
    `packages = ${JSON.stringify(requiredImports)}`,
    'missing = []',
    'for package in packages:',
    '    try:',
    '        importlib.import_module(package)',
    '    except Exception:',
    '        missing.append(package)',
    'print(json.dumps(missing))'
  ].join('\n');
  const runtimeEnv = getRuntimeEnv(RUNTIME_TMP_DIR);
  const firstCheck = await runProcess(python, ['-c', importCode], cwd, '', 60000, runtimeEnv);
  let missing: string[] = [];
  try {
    missing = JSON.parse(firstCheck.stdout.trim() || '[]');
  } catch {
    missing = requiredImports;
  }
  if (missing.length === 0) {
    pythonReadyModes.add(mode);
    if (mode === 'excel_light') {
      pythonCashflowStackReady = true;
      pythonSpreadsheetStackReady = true;
    } else if (mode === 'table') {
      pythonSpreadsheetStackReady = true;
    } else if (mode === 'analysis') {
      pythonStackReady = true;
      pythonSpreadsheetStackReady = true;
      pythonCashflowStackReady = true;
    }
    return python;
  }
  const install = await runProcess(python, ['-m', 'pip', 'install', '--disable-pip-version-check', ...requiredPackages], cwd, '', 900000, runtimeEnv);
  if (install.exitCode !== 0) {
    throw new Error(install.stderr || install.stdout || 'Automatic Python dependency setup failed.');
  }
  const secondCheck = await runProcess(python, ['-c', importCode], cwd, '', 60000, runtimeEnv);
  try {
    missing = JSON.parse(secondCheck.stdout.trim() || '[]');
  } catch {
    missing = requiredImports;
  }
  if (missing.length > 0) {
    throw new Error(`Automatic Python dependency setup failed for: ${missing.join(', ')}`);
  }
  pythonReadyModes.add(mode);
  if (mode === 'excel_light') {
    pythonCashflowStackReady = true;
    pythonSpreadsheetStackReady = true;
  } else if (mode === 'table') {
    pythonSpreadsheetStackReady = true;
  } else if (mode === 'analysis') {
    pythonStackReady = true;
    pythonSpreadsheetStackReady = true;
    pythonCashflowStackReady = true;
  }
  return python;
};

const getPythonRuntimeManifest = async (python: string, cwd: string, mode: PythonRuntimeMode) => {
  const packages = MODE_IMPORTS[mode];
  const code = [
    'import importlib.metadata as metadata, json, sys',
    `packages = ${JSON.stringify(packages)}`,
    'versions = {}',
    'aliases = {"sklearn": "scikit-learn", "PIL": "pillow"}',
    'for package in packages:',
    '    name = aliases.get(package, package)',
    '    try:',
    '        versions[package] = metadata.version(name)',
    '    except Exception:',
    '        versions[package] = ""',
    'print(json.dumps({"python": sys.version.split()[0], "mode": ' + JSON.stringify(mode) + ', "packages": versions}))'
  ].join('\n');
  const result = await runProcess(python, ['-c', code], cwd, '', 60000, getRuntimeEnv(RUNTIME_TMP_DIR));
  try {
    return JSON.parse(result.stdout.trim() || '{}') as Record<string, unknown>;
  } catch {
    return { mode, packages: {} };
  }
};

const analysisScript = String.raw`
import base64
import builtins
import contextlib
import io
import importlib
import json
import math
import os
import re
import runpy
import subprocess
import sys
import traceback
import warnings

warnings.filterwarnings("ignore")
marker = "__DEEPCHAT_ANALYSIS_RESULT__"
payload = json.loads(sys.stdin.read() or "{}")
output_dir = payload.get("outputDir") or os.getcwd()
requested_charts = payload.get("requestedCharts") or []
runtime_manifest = payload.get("runtimeManifest") or {}
wants_spreadsheet = bool(payload.get("wantsSpreadsheet"))
user_code = payload.get("code") or ""
spreadsheet_only = wants_spreadsheet and not user_code
prompt_text = (payload.get("prompt") or "").lower()
cashflow_only = spreadsheet_only and not (payload.get("files") or []) and any(token in prompt_text for token in ["cashflow", "cash flow", "arus kas", "kas bisnis", "cashflow bisnis"])
analysis_mode = payload.get("analysisMode") or ("excel_light" if cashflow_only else "table" if spreadsheet_only else "analysis")
mode_imports = {
    "excel_light": ["openpyxl"],
    "table": ["pandas", "numpy", "openpyxl"],
    "chart": ["pandas", "numpy", "matplotlib", "seaborn", "plotly", "openpyxl"],
    "analysis": ["pandas", "numpy", "matplotlib", "seaborn", "plotly", "openpyxl", "sklearn"]
}
required = mode_imports.get(analysis_mode, mode_imports["analysis"])
missing = []

for package in required:
    try:
        importlib.import_module(package)
    except Exception:
        missing.append(package)

if missing:
    print(marker + json.dumps({
        "success": False,
        "error": "Automatic Python dependency setup failed for: " + ", ".join(missing)
    }))
    sys.exit(0)

from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter
from deepchat_excel_formula_engine import evaluate_cell

if analysis_mode == "excel_light":
    has_sklearn = True
elif analysis_mode == "table":
    import numpy as np
    import pandas as pd
    has_sklearn = True
elif analysis_mode == "chart":
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns
    import plotly.express as px
    import plotly.io as pio
    has_sklearn = False
    sns.set_theme(style="whitegrid", palette="deep")
else:
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import plotly.express as px
    import plotly.io as pio
    import seaborn as sns
    from matplotlib.backends.backend_pdf import PdfPages
    try:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        has_sklearn = True
    except Exception:
        has_sklearn = False
    sns.set_theme(style="whitegrid", palette="deep")
os.makedirs(output_dir, exist_ok=True)
palette = ["#2f7ed8", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#17becf"]

allowed_read_roots = set()
allowed_write_roots = set([os.path.abspath(output_dir)])
for item in payload.get("files") or []:
    file_path = item.get("path")
    if file_path:
        allowed_read_roots.add(os.path.abspath(file_path))
        allowed_read_roots.add(os.path.abspath(os.path.dirname(file_path)))
allowed_read_roots.add(os.path.abspath(output_dir))
allowed_read_roots.add(os.path.abspath(sys.prefix))
allowed_read_roots.add(os.path.abspath(sys.base_prefix))
original_open = builtins.open
original_os_open = os.open
original_remove = os.remove
original_unlink = os.unlink
original_rename = os.rename
original_replace = os.replace
original_makedirs = os.makedirs
original_listdir = os.listdir
original_scandir = os.scandir

def is_subpath(path, root):
    try:
        current = os.path.abspath(path)
        parent = os.path.abspath(root)
        return current == parent or current.startswith(parent + os.sep)
    except Exception:
        return False

def assert_read_path(path):
    if path is None:
        return
    if isinstance(path, int):
        return
    if hasattr(path, "fileno"):
        return
    text = os.fspath(path)
    if not text or text.startswith("<"):
        return
    current = os.path.abspath(text)
    if any(is_subpath(current, root) for root in allowed_read_roots):
        return
    raise PermissionError("Code Execution can only read uploaded files, generated artifacts, and runtime libraries.")

def assert_write_path(path):
    if path is None:
        return
    if isinstance(path, int):
        return
    text = os.fspath(path)
    current = os.path.abspath(text)
    if any(is_subpath(current, root) for root in allowed_write_roots):
        return
    raise PermissionError("Code Execution can only write files inside the current analysis workspace.")

def guarded_open(file, mode="r", *args, **kwargs):
    mode_text = str(mode)
    if any(token in mode_text for token in ["w", "a", "x", "+"]):
        assert_write_path(file)
    else:
        assert_read_path(file)
    return original_open(file, mode, *args, **kwargs)

def guarded_os_open(file, flags, *args, **kwargs):
    write_flags = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC
    if flags & write_flags:
        assert_write_path(file)
    else:
        assert_read_path(file)
    return original_os_open(file, flags, *args, **kwargs)

def guarded_remove(path, *args, **kwargs):
    assert_write_path(path)
    return original_remove(path, *args, **kwargs)

def guarded_unlink(path, *args, **kwargs):
    assert_write_path(path)
    return original_unlink(path, *args, **kwargs)

def guarded_rename(src, dst, *args, **kwargs):
    assert_write_path(src)
    assert_write_path(dst)
    return original_rename(src, dst, *args, **kwargs)

def guarded_replace(src, dst, *args, **kwargs):
    assert_write_path(src)
    assert_write_path(dst)
    return original_replace(src, dst, *args, **kwargs)

def guarded_makedirs(name, *args, **kwargs):
    assert_write_path(name)
    return original_makedirs(name, *args, **kwargs)

def guarded_listdir(path="."):
    assert_read_path(path)
    return original_listdir(path)

def guarded_scandir(path="."):
    assert_read_path(path)
    return original_scandir(path)

def clean_value(value):
    if value is None:
        return None
    if isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    np_module = globals().get("np")
    if np_module is not None and isinstance(value, (np_module.integer,)):
        return int(value)
    if np_module is not None and isinstance(value, (np_module.floating,)):
        item = float(value)
        if math.isnan(item) or math.isinf(item):
            return None
        return item
    if isinstance(value, (list, tuple)):
        return [clean_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): clean_value(item) for key, item in value.items()}
    return str(value)

def frame_sample(df, rows=8):
    return clean_value(df.head(rows).replace({np.nan: None}).to_dict(orient="records"))

def read_dataset(item):
    ext = (item.get("ext") or "").lower()
    path = item.get("path")
    if ext == "csv":
        return pd.read_csv(path)
    if ext in ["xlsx", "xls"]:
        return pd.read_excel(path)
    if ext == "jsonl":
        return pd.read_json(path, lines=True)
    if ext == "json":
        try:
            return pd.read_json(path)
        except Exception:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                for value in data.values():
                    if isinstance(value, list):
                        return pd.DataFrame(value)
            return pd.json_normalize(data)
    raise ValueError("Unsupported data format: " + ext)

def make_prompt_dataset(prompt):
    text = (prompt or "").lower()
    seed = sum(ord(char) for char in text) % 10000
    rng = np.random.default_rng(seed)
    years = list(range(2019, 2030))
    if any(token in text for token in ["economy", "economic", "gdp", "indonesia", "ekonomi"]):
        shock = np.array([0, -6.8, -1.1, 0.8, 0.3, 0.4, 0.55, 0.7, 0.78, 0.86, 0.94])
        trend = np.linspace(4.8, 5.7, len(years))
        growth = np.round(trend + shock + rng.normal(0, 0.08, len(years)), 2)
        inflation = np.round(np.clip(np.linspace(2.4, 3.2, len(years)) + rng.normal(0, 0.22, len(years)), 1.4, 5.8), 2)
        investment = np.round(100 + np.cumsum(rng.normal(6.2, 1.1, len(years))), 1)
        consumption = np.round(100 + np.cumsum(rng.normal(4.1, 0.8, len(years))), 1)
        return pd.DataFrame({
            "Year": years,
            "Growth Rate": growth,
            "Inflation Rate": inflation,
            "Investment Momentum": investment,
            "Consumer Demand": consumption,
            "Projection": ["Historical", "Historical", "Historical", "Historical", "Historical", "Projection", "Projection", "Projection", "Projection", "Projection", "Projection"]
        })
    months = pd.date_range("2025-01-01", periods=12, freq="MS")
    primary = np.round(120 + np.cumsum(rng.normal(6.5, 2.2, len(months))), 1)
    secondary = np.round(70 + np.cumsum(rng.normal(2.5, 1.1, len(months))), 1)
    return pd.DataFrame({
        "Period": months,
        "Primary Metric": primary,
        "Secondary Metric": secondary,
        "Segment": ["North", "South", "East", "West"] * 3
    })

def detect_datetime_columns(df):
    result = []
    for column in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[column]):
            result.append(column)
            continue
        if pd.api.types.is_numeric_dtype(df[column]):
            continue
        name = str(column).lower()
        if any(token in name for token in ["date", "time", "month", "year", "period"]):
            parsed = pd.to_datetime(df[column], errors="coerce")
            if parsed.notna().mean() >= 0.6:
                df[column] = parsed
                result.append(column)
    return result

def impute_dataframe(df):
    next_df = df.copy()
    report = {}
    for column in next_df.columns:
        missing = int(next_df[column].isna().sum())
        if missing == 0:
            continue
        if pd.api.types.is_numeric_dtype(next_df[column]):
            value = next_df[column].median()
            if pd.isna(value):
                value = 0
            next_df[column] = next_df[column].fillna(value)
            report[column] = {"missing": missing, "method": "median", "value": clean_value(value)}
        elif pd.api.types.is_datetime64_any_dtype(next_df[column]):
            value = next_df[column].dropna().median() if next_df[column].dropna().shape[0] else pd.Timestamp.utcnow()
            next_df[column] = next_df[column].fillna(value)
            report[column] = {"missing": missing, "method": "datetime median", "value": str(value)}
        else:
            mode = next_df[column].mode(dropna=True)
            value = mode.iloc[0] if not mode.empty else "Unknown"
            next_df[column] = next_df[column].fillna(value)
            report[column] = {"missing": missing, "method": "mode", "value": clean_value(value)}
    return next_df, report

def describe_columns(df):
    numeric = list(df.select_dtypes(include=[np.number]).columns)
    categorical = [column for column in df.columns if column not in numeric and not pd.api.types.is_datetime64_any_dtype(df[column])]
    datetime_columns = detect_datetime_columns(df)
    return numeric, categorical, datetime_columns

def statistical_summary(df, numeric):
    if not numeric:
        return {}
    summary = df[numeric].agg(["mean", "median", "std", "min", "max"]).transpose()
    return clean_value(summary.round(4).to_dict(orient="index"))

def correlation_summary(df, numeric):
    if len(numeric) < 2:
        return {"matrix": {}, "strongest": []}
    corr = df[numeric].corr(numeric_only=True).round(4)
    pairs = []
    for i, left in enumerate(numeric):
        for right in numeric[i + 1:]:
            value = corr.loc[left, right]
            if pd.notna(value):
                pairs.append({"columns": [left, right], "value": clean_value(round(float(value), 4))})
    pairs.sort(key=lambda item: abs(item["value"] or 0), reverse=True)
    return {"matrix": clean_value(corr.to_dict()), "strongest": pairs[:5]}

def regression_summary(df, numeric):
    if len(numeric) < 2:
        return None
    x_col = numeric[0]
    y_col = numeric[1]
    points = df[[x_col, y_col]].dropna()
    if points.shape[0] < 3:
        return None
    x = points[x_col].to_numpy(dtype=float)
    y = points[y_col].to_numpy(dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    predicted = slope * x + intercept
    ss_res = np.sum((y - predicted) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot else 0
    return clean_value({
        "x": x_col,
        "y": y_col,
        "slope": round(float(slope), 6),
        "intercept": round(float(intercept), 6),
        "r2": round(float(r2), 6)
    })

def clustering_summary(df, numeric):
    if not has_sklearn or len(numeric) < 2 or df.shape[0] < 6:
        return None
    values = df[numeric].dropna()
    if values.shape[0] < 6:
        return None
    k = min(4, max(2, int(round(math.sqrt(values.shape[0] / 2)))))
    scaled = StandardScaler().fit_transform(values)
    model = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = model.fit_predict(scaled)
    counts = pd.Series(labels).value_counts().sort_index().to_dict()
    centers = pd.DataFrame(model.cluster_centers_, columns=numeric).round(4).to_dict(orient="records")
    return clean_value({"clusters": k, "counts": counts, "centers": centers})

def outlier_summary(df, numeric):
    items = []
    for column in numeric:
        series = df[column].dropna()
        if series.empty:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        count = int(((series < lower) | (series > upper)).sum())
        if count:
            items.append({
                "column": column,
                "count": count,
                "lower": clean_value(round(float(lower), 4)),
                "upper": clean_value(round(float(upper), 4))
            })
    return items

def trend_summary(df, numeric, datetime_columns):
    if not numeric:
        return []
    trends = []
    ordered = df.sort_values(datetime_columns[0]) if datetime_columns else df.reset_index(drop=True)
    for column in numeric[:5]:
        values = ordered[column].dropna().to_numpy(dtype=float)
        if len(values) < 3:
            continue
        x = np.arange(len(values))
        slope = float(np.polyfit(x, values, 1)[0])
        change = float(values[-1] - values[0])
        direction = "up" if slope > 0 else "down" if slope < 0 else "flat"
        if abs(change) > max(float(np.nanstd(values)), 1e-9) * 0.25:
            trends.append({"column": column, "direction": direction, "change": clean_value(round(change, 4)), "slope": clean_value(round(slope, 6))})
    return trends

def save_plot(name, fig):
    file_name = name + ".png"
    path = os.path.join(output_dir, file_name)
    fig.savefig(path, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return file_name

def save_html(name, fig):
    file_name = name + ".html"
    path = os.path.join(output_dir, file_name)
    pio.write_html(fig, path, full_html=True, include_plotlyjs="cdn", auto_open=False)
    return file_name

analysis_charts = []
analysis_exports = []
runtime_dataframes = {}

def install_package(package):
    package_text = str(package or "").strip()
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9_,.-]+\])?(==[A-Za-z0-9.*!+_-]+|>=[A-Za-z0-9.*!+_-]+|<=[A-Za-z0-9.*!+_-]+)?$", package_text):
        raise ValueError("Package name is not allowed.")
    package = package_text
    result = subprocess.run([sys.executable, "-m", "pip", "install", package], capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "Package installation failed").strip())
    return result.stdout.strip()

def enable_filesystem_guard():
    builtins.open = guarded_open
    os.open = guarded_os_open
    os.remove = guarded_remove
    os.unlink = guarded_unlink
    os.rename = guarded_rename
    os.replace = guarded_replace
    os.makedirs = guarded_makedirs
    os.listdir = guarded_listdir
    os.scandir = guarded_scandir

def save_current_matplotlib_chart(title="Analysis Chart", chart_type="chart"):
    fig = plt.gcf()
    file_key = "ai_chart_" + str(len(analysis_charts) + 1)
    png = save_plot(file_key, fig)
    analysis_charts.append({"title": title, "type": chart_type, "staticName": png, "interactiveName": ""})
    return png

def save_plotly_chart(fig, title="Interactive Analysis Chart", chart_type="chart"):
    file_key = "ai_chart_" + str(len(analysis_charts) + 1)
    html = save_html(file_key, fig)
    analysis_charts.append({"title": title, "type": chart_type, "staticName": "", "interactiveName": html})
    return html

def workbook_color(value):
    if getattr(value, "fill_type", None) is None:
        return ""
    color = getattr(value, "fgColor", None)
    rgb = getattr(color, "rgb", None)
    if isinstance(rgb, str) and len(rgb) in [6, 8]:
        return "#" + rgb[-6:]
    return ""

def workbook_cell_value(cell):
    value = cell.value
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value

def workbook_text_color(value):
    color = getattr(value, "color", None)
    rgb = getattr(color, "rgb", None)
    if isinstance(rgb, str) and len(rgb) in [6, 8]:
        return "#" + rgb[-6:]
    return ""

def workbook_chart_title(chart):
    title = getattr(chart, "title", None)
    try:
        rich = getattr(title, "tx", None)
        rich = getattr(rich, "rich", None)
        paragraphs = getattr(rich, "p", None) or []
        parts = []
        for paragraph in paragraphs:
            for run in getattr(paragraph, "r", None) or []:
                text = getattr(run, "t", "")
                if text:
                    parts.append(str(text))
        return " ".join(parts).strip()
    except Exception:
        return ""
    return ""

def workbook_charts(sheet):
    charts = []
    for index, chart in enumerate(getattr(sheet, "_charts", []) or []):
        anchor = getattr(chart, "anchor", None)
        marker = getattr(anchor, "_from", None)
        row = int(getattr(marker, "row", 0) or 0) + 1
        column = int(getattr(marker, "col", 0) or 0) + 1
        charts.append({
            "title": workbook_chart_title(chart) or "Chart " + str(index + 1),
            "type": chart.__class__.__name__,
            "anchor": get_column_letter(max(column, 1)) + str(max(row, 1))
        })
    return charts

def build_workbook_preview(path, file_name, max_rows=120, max_columns=36):
    if not path or not os.path.exists(path):
        return None
    workbook = load_workbook(path, data_only=False)
    values_workbook = load_workbook(path, data_only=True)
    sheets = []
    selected_cell = "A1"
    selected_value = ""
    for sheet in workbook.worksheets:
        actual_rows = max(sheet.max_row or 1, 1)
        actual_columns = max(sheet.max_column or 1, 1)
        preview_rows = min(actual_rows, max_rows)
        preview_columns = min(actual_columns, max_columns)
        cells = []
        column_widths = {}
        for column_index in range(1, preview_columns + 1):
            letter = get_column_letter(column_index)
            width = sheet.column_dimensions[letter].width or 10
            column_widths[str(column_index)] = min(max(float(width) * 8, 64), 220)
        for row in sheet.iter_rows(min_row=1, max_row=preview_rows, min_col=1, max_col=preview_columns):
            for cell in row:
                raw = workbook_cell_value(cell)
                formula = raw if isinstance(raw, str) and raw.startswith("=") else ""
                display = evaluate_cell(workbook, values_workbook, sheet.title, cell.coordinate) if formula else raw
                if display == "":
                    continue
                if selected_value == "":
                    selected_cell = cell.coordinate
                    selected_value = display
                cells.append({
                    "row": cell.row,
                    "column": cell.column,
                    "address": cell.coordinate,
                    "value": raw,
                    "formula": formula,
                    "displayValue": display,
                    "bold": bool(cell.font.bold),
                    "italic": bool(cell.font.italic),
                    "textColor": workbook_text_color(cell.font),
                    "fillColor": workbook_color(cell.fill),
                    "horizontalAlign": cell.alignment.horizontal or "",
                    "numberFormat": cell.number_format or ""
                })
        sheets.append({
            "name": sheet.title,
            "rowCount": actual_rows,
            "columnCount": actual_columns,
            "previewRowCount": preview_rows,
            "previewColumnCount": preview_columns,
            "columnWidths": column_widths,
            "mergedRanges": [str(item) for item in sheet.merged_cells.ranges],
            "charts": workbook_charts(sheet),
            "cells": cells
        })
    active = workbook.active.title if workbook.worksheets else ""
    return clean_value({
        "fileName": file_name,
        "activeSheet": active,
        "selectedCell": selected_cell,
        "displayValue": selected_value,
        "sheets": sheets
    })

def style_excel_workbook(path):
    workbook = load_workbook(path)
    header_fill = PatternFill("solid", fgColor="111827")
    header_font = Font(color="FFFFFF", bold=True)
    total_fill = PatternFill("solid", fgColor="E0F2FE")
    for sheet in workbook.worksheets:
        if sheet.max_row < 1 or sheet.max_column < 1:
            continue
        for cell in sheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
        for column_cells in sheet.columns:
            values = [str(cell.value) if cell.value is not None else "" for cell in column_cells]
            width = min(max([len(value) for value in values] + [10]) + 2, 34)
            sheet.column_dimensions[get_column_letter(column_cells[0].column)].width = width
        sheet.freeze_panes = "A2"
        if sheet.max_row >= 2 and sheet.max_column >= 1:
            ref = "A1:" + get_column_letter(sheet.max_column) + str(sheet.max_row)
            table_name = "".join(ch for ch in sheet.title.title() if ch.isalnum())[:20] or "Table"
            existing = set(sheet.tables.keys())
            suffix = 1
            unique_name = table_name
            while unique_name in existing:
                suffix += 1
                unique_name = table_name + str(suffix)
            table = Table(displayName=unique_name, ref=ref)
            table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
            sheet.add_table(table)
        for row in sheet.iter_rows():
            for cell in row:
                cell.alignment = Alignment(vertical="center")
        if sheet.title.lower().startswith("summary"):
            for row in sheet.iter_rows(min_row=2):
                for cell in row:
                    cell.fill = total_fill
                    cell.font = Font(bold=True)
    workbook.save(path)

def clean_sheet_name(value, fallback="Sheet"):
    text = "".join(ch for ch in str(value or fallback) if ch not in ["\\", "/", "*", "?", ":", "[", "]"]).strip()
    return (text or fallback)[:31]

def add_sheet_table(sheet, style="TableStyleMedium4"):
    if sheet.max_row < 2 or sheet.max_column < 1:
        return
    ref = "A1:" + get_column_letter(sheet.max_column) + str(sheet.max_row)
    table_name = "".join(ch for ch in sheet.title.title() if ch.isalnum())[:20] or "Table"
    suffix = 1
    unique_name = table_name
    while unique_name in sheet.tables:
        suffix += 1
        unique_name = table_name + str(suffix)
    table = Table(displayName=unique_name, ref=ref)
    table.tableStyleInfo = TableStyleInfo(name=style, showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
    sheet.add_table(table)

def finish_prompt_workbook(workbook):
    header_fill = PatternFill("solid", fgColor="107C41")
    header_font = Font(color="FFFFFF", bold=True)
    soft_fill = PatternFill("solid", fgColor="E2F0D9")
    for sheet in workbook.worksheets:
        sheet.freeze_panes = "A2"
        for cell in sheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for row in sheet.iter_rows():
            for cell in row:
                cell.alignment = Alignment(vertical="center", horizontal=cell.alignment.horizontal)
        for column_cells in sheet.columns:
            values = [str(cell.value) if cell.value is not None else "" for cell in column_cells]
            width = min(max([len(value) for value in values] + [10]) + 2, 36)
            sheet.column_dimensions[get_column_letter(column_cells[0].column)].width = width
        for row_index in range(2, sheet.max_row + 1):
            if row_index % 2 == 0:
                for cell in sheet[row_index]:
                    if not cell.fill or not cell.fill.fill_type:
                        cell.fill = soft_fill
        add_sheet_table(sheet)

def save_prompt_cashflow_workbook(file_name="template_cashflow_12_bulan.xlsx"):
    safe_name = "".join(ch for ch in file_name if ch.isalnum() or ch in ["-", "_", "."]).strip(".") or "template_cashflow_12_bulan.xlsx"
    if not safe_name.lower().endswith(".xlsx"):
        safe_name += ".xlsx"
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Ringkasan"
    months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    cashflow = workbook.create_sheet("Cashflow")
    expense = workbook.create_sheet("Analisis Pengeluaran")
    projection = workbook.create_sheet("Proyeksi")
    assumptions = workbook.create_sheet("Asumsi & Cara Pakai")
    summary.append(["Metrik", "Nilai"])
    summary_rows = [
        ["Total Pemasukan Tahunan", "=SUM(Cashflow!B2:M2)"],
        ["Total Pengeluaran Tahunan", "=SUM(Cashflow!B3:M3)"],
        ["Arus Kas Bersih Tahunan", "=SUM(Cashflow!B4:M4)"],
        ["Saldo Awal Tahun", "=Cashflow!B5"],
        ["Saldo Akhir Tahun", "=Cashflow!M6"],
        ["Rata-rata Pemasukan Bulanan", "=AVERAGE(Cashflow!B2:M2)"],
        ["Rata-rata Pengeluaran Bulanan", "=AVERAGE(Cashflow!B3:M3)"],
        ["Rata-rata Arus Kas Bersih Bulanan", "=AVERAGE(Cashflow!B4:M4)"],
        ["Margin Kas Bersih Rata-rata", "=AVERAGE(Cashflow!B4:M4)/AVERAGE(Cashflow!B2:M2)"],
        ["Bulan Saldo Akhir Tertinggi", "=INDEX(Cashflow!B1:M1,MATCH(MAX(Cashflow!B6:M6),Cashflow!B6:M6,0))"],
        ["Bulan Saldo Akhir Terendah", "=INDEX(Cashflow!B1:M1,MATCH(MIN(Cashflow!B6:M6),Cashflow!B6:M6,0))"]
    ]
    for row in summary_rows:
        summary.append(row)
    cashflow.append(["Komponen", *months, "Total", "Rata-rata"])
    income = [45000000, 47000000, 50000000, 52000000, 54000000, 57000000, 59000000, 61000000, 64000000, 66000000, 69000000, 72000000]
    expense_values = [31000000, 32500000, 34000000, 35000000, 36500000, 38000000, 39500000, 41000000, 42500000, 43500000, 45000000, 47000000]
    cashflow.append(["Pemasukan", *income, "=SUM(B2:M2)", "=AVERAGE(B2:M2)"])
    cashflow.append(["Pengeluaran", *expense_values, "=SUM(B3:M3)", "=AVERAGE(B3:M3)"])
    cashflow.append(["Arus Kas Bersih", *[f"={get_column_letter(index)}2-{get_column_letter(index)}3" for index in range(2, 14)], "=SUM(B4:M4)", "=AVERAGE(B4:M4)"])
    cashflow.append(["Saldo Awal", 25000000, *[f"={get_column_letter(index - 1)}6" for index in range(3, 14)], "=B5", "=B5"])
    cashflow.append(["Saldo Akhir", *[f"={get_column_letter(index)}5+{get_column_letter(index)}4" for index in range(2, 14)], "=M6", "=AVERAGE(B6:M6)"])
    expense.append(["Kategori", *months, "Total", "Porsi"])
    expense_categories = {
        "Operasional": [12000000, 12300000, 12600000, 13000000, 13400000, 13900000, 14200000, 14600000, 15000000, 15300000, 15800000, 16200000],
        "Marketing": [6000000, 6300000, 6900000, 7200000, 7600000, 8000000, 8300000, 8700000, 9100000, 9400000, 9800000, 10200000],
        "Gaji": [10000000, 10200000, 10400000, 10600000, 10800000, 11000000, 11200000, 11400000, 11600000, 11800000, 12000000, 12200000],
        "Lainnya": [3000000, 4000000, 4100000, 4200000, 4300000, 4100000, 4200000, 4300000, 4400000, 4200000, 3400000, 4400000]
    }
    for category, values in expense_categories.items():
        row_index = expense.max_row + 1
        expense.append([category, *values, f"=SUM(B{row_index}:M{row_index})", f"=N{row_index}/SUM($N$2:$N$5)"])
    projection.append(["Bulan", "Pemasukan Proyeksi", "Pengeluaran Proyeksi", "Arus Kas Bersih", "Saldo Akhir"])
    for index, month in enumerate(months, start=2):
        projection.append([month, f"=Cashflow!{get_column_letter(index)}2*1.08", f"=Cashflow!{get_column_letter(index)}3*1.05", f"=B{index}-C{index}", f"=IF(ROW()=2,Cashflow!M6,D{index}+E{index-1})"])
    assumptions.append(["Area", "Nilai"])
    for row in [
        ["Periode", "12 bulan"],
        ["Pertumbuhan pemasukan proyeksi", "8%"],
        ["Pertumbuhan pengeluaran proyeksi", "5%"],
        ["Catatan", "Angka dapat diedit di sheet Cashflow dan rumus akan mengikuti saat dibuka di Excel."]
    ]:
        assumptions.append(row)
    line_chart = LineChart()
    line_chart.title = "Saldo Akhir Bulanan"
    line_chart.y_axis.title = "Saldo"
    line_chart.x_axis.title = "Bulan"
    line_data = Reference(cashflow, min_col=2, max_col=13, min_row=6, max_row=6)
    line_categories = Reference(cashflow, min_col=2, max_col=13, min_row=1, max_row=1)
    line_chart.add_data(line_data, from_rows=True, titles_from_data=False)
    line_chart.set_categories(line_categories)
    cashflow.add_chart(line_chart, "B9")
    bar_chart = BarChart()
    bar_chart.title = "Pemasukan vs Pengeluaran"
    bar_chart.y_axis.title = "Nilai"
    bar_chart.x_axis.title = "Bulan"
    bar_data = Reference(cashflow, min_col=2, max_col=13, min_row=2, max_row=3)
    bar_chart.add_data(bar_data, from_rows=True, titles_from_data=True)
    bar_chart.set_categories(line_categories)
    cashflow.add_chart(bar_chart, "J9")
    finish_prompt_workbook(workbook)
    path = os.path.join(output_dir, safe_name)
    workbook.save(path)
    export_item = {"name": safe_name, "label": "Excel workbook", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
    analysis_exports.append(export_item)
    return safe_name

def prompt_wants_cashflow(prompt):
    text = (prompt or "").lower()
    return any(token in text for token in ["cashflow", "cash flow", "arus kas", "kas bisnis", "cashflow bisnis"])

def save_prompt_spreadsheet(prompt, frames):
    if prompt_wants_cashflow(prompt):
        return save_prompt_cashflow_workbook()
    return save_excel_workbook("analysis-table.xlsx", frames)

def generated_workbook_display_code(kind):
    if kind == "cashflow":
        return "\n".join([
            "output_name = save_prompt_cashflow_workbook('template_cashflow_12_bulan.xlsx')",
            "output_path = os.path.join(output_dir, output_name)",
            "workbook_preview = build_workbook_preview(output_path, output_name)",
            "print('Generated Excel workbook:', output_name)",
            "print('Runtime mode:', analysis_mode)"
        ])
    return "\n".join([
        "frames = {}",
        "for index, source in enumerate(sources):",
        "    source_name, dataframe = source",
        "    dataframe.columns = [str(column) for column in dataframe.columns]",
        "    frames['dataset_' + str(index + 1)] = dataframe",
        "",
        "output_name = save_prompt_spreadsheet(prompt, frames)",
        "output_path = os.path.join(output_dir, output_name)",
        "workbook_preview = build_workbook_preview(output_path, output_name)",
        "print('Generated Excel workbook:', output_name)",
        "print('Runtime mode:', analysis_mode)"
    ])

def save_excel_workbook(file_name="analysis-table.xlsx", sheets=None, include_summary=True):
    safe_name = "".join(ch for ch in file_name if ch.isalnum() or ch in ["-", "_", "."]).strip(".") or "analysis-table.xlsx"
    if not safe_name.lower().endswith(".xlsx"):
        safe_name += ".xlsx"
    path = os.path.join(output_dir, safe_name)
    source_sheets = sheets or runtime_dataframes
    if isinstance(source_sheets, pd.DataFrame):
        source_sheets = {"Data": source_sheets}
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for sheet_name, sheet_df in source_sheets.items():
            current_df = pd.DataFrame(sheet_df)
            current_df.to_excel(writer, sheet_name=str(sheet_name)[:31] or "Data", index=False)
        if include_summary:
            summary_rows = []
            for sheet_name, sheet_df in source_sheets.items():
                current_df = pd.DataFrame(sheet_df)
                numeric = list(current_df.select_dtypes(include=[np.number]).columns)
                for column in numeric[:10]:
                    excel_column = get_column_letter(list(current_df.columns).index(column) + 1)
                    last_row = max(len(current_df) + 1, 2)
                    summary_rows.append({
                        "Sheet": str(sheet_name)[:31] or "Data",
                        "Column": column,
                        "Total": f"=SUM('{str(sheet_name)[:31] or 'Data'}'!{excel_column}2:{excel_column}{last_row})",
                        "Average": f"=AVERAGE('{str(sheet_name)[:31] or 'Data'}'!{excel_column}2:{excel_column}{last_row})"
                    })
            if summary_rows:
                pd.DataFrame(summary_rows).to_excel(writer, sheet_name="Summary", index=False)
    style_excel_workbook(path)
    export_item = {"name": safe_name, "label": "Excel workbook", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
    analysis_exports.append(export_item)
    return safe_name

def wants_chart(kind):
    return not requested_charts or kind in requested_charts

def build_charts(df, safe_name, numeric, categorical, datetime_columns):
    charts = []
    if numeric and wants_chart("line"):
        x_col = datetime_columns[0] if datetime_columns else None
        y_col = numeric[0]
        fig, ax = plt.subplots(figsize=(8, 5))
        x_values = df[x_col] if x_col else np.arange(len(df))
        sns.lineplot(x=x_values, y=df[y_col], marker="o", ax=ax, color=palette[0])
        ax.set_title("Trend " + y_col)
        ax.set_xlabel(x_col or "Index")
        ax.set_ylabel(y_col)
        png = save_plot(safe_name + "_line", fig)
        html = save_html(safe_name + "_line", px.line(df, x=x_col if x_col else df.index, y=y_col, markers=True, title="Trend " + y_col))
        charts.append({"title": "Trend " + y_col, "type": "line", "staticName": png, "interactiveName": html})
    if categorical and (wants_chart("bar") or wants_chart("pie")):
        category = categorical[0]
        counts = df[category].astype(str).value_counts().head(10)
        chart_df = counts.reset_index()
        chart_df.columns = [category, "count"]
        if wants_chart("bar"):
            fig, ax = plt.subplots(figsize=(8, 5))
            sns.barplot(x=counts.index, y=counts.values, ax=ax, palette="deep")
            ax.set_title("Distribution by " + category)
            ax.set_xlabel(category)
            ax.set_ylabel("Count")
            ax.tick_params(axis="x", rotation=35)
            png = save_plot(safe_name + "_bar", fig)
            html = save_html(safe_name + "_bar", px.bar(chart_df, x=category, y="count", title="Distribution by " + category))
            charts.append({"title": "Distribution by " + category, "type": "bar", "staticName": png, "interactiveName": html})
        if wants_chart("pie"):
            fig, ax = plt.subplots(figsize=(7, 5))
            ax.pie(counts.values, labels=counts.index, autopct="%1.1f%%", colors=sns.color_palette("deep", len(counts)))
            ax.set_title("Share by " + category)
            png = save_plot(safe_name + "_pie", fig)
            html = save_html(safe_name + "_pie", px.pie(chart_df, names=category, values="count", title="Share by " + category))
            charts.append({"title": "Share by " + category, "type": "pie", "staticName": png, "interactiveName": html})
    if len(numeric) >= 2 and wants_chart("scatter"):
        fig, ax = plt.subplots(figsize=(8, 5))
        sns.scatterplot(data=df, x=numeric[0], y=numeric[1], ax=ax, color=palette[2])
        ax.set_title(numeric[0] + " vs " + numeric[1])
        png = save_plot(safe_name + "_scatter", fig)
        html = save_html(safe_name + "_scatter", px.scatter(df, x=numeric[0], y=numeric[1], title=numeric[0] + " vs " + numeric[1]))
        charts.append({"title": numeric[0] + " vs " + numeric[1], "type": "scatter", "staticName": png, "interactiveName": html})
    if len(numeric) >= 2 and wants_chart("heatmap"):
        corr = df[numeric].corr(numeric_only=True)
        fig, ax = plt.subplots(figsize=(8, 6))
        sns.heatmap(corr, annot=True, cmap="vlag", center=0, ax=ax)
        ax.set_title("Correlation Heatmap")
        png = save_plot(safe_name + "_heatmap", fig)
        html = save_html(safe_name + "_heatmap", px.imshow(corr, text_auto=True, aspect="auto", title="Correlation Heatmap"))
        charts.append({"title": "Correlation Heatmap", "type": "heatmap", "staticName": png, "interactiveName": html})
    if numeric and wants_chart("boxplot"):
        fig, ax = plt.subplots(figsize=(8, 5))
        sns.boxplot(data=df[numeric[:6]], ax=ax, palette="deep")
        ax.set_title("Outlier Boxplot")
        ax.tick_params(axis="x", rotation=35)
        png = save_plot(safe_name + "_boxplot", fig)
        melted = df[numeric[:6]].melt(var_name="column", value_name="value")
        html = save_html(safe_name + "_boxplot", px.box(melted, x="column", y="value", title="Outlier Boxplot"))
        charts.append({"title": "Outlier Boxplot", "type": "boxplot", "staticName": png, "interactiveName": html})
    return charts

def export_outputs(results, frames):
    exports = []
    pdf_name = "analysis-report.pdf"
    pdf_path = os.path.join(output_dir, pdf_name)
    with PdfPages(pdf_path) as pdf:
        for result in results:
            for chart in result.get("charts", []):
                image_path = os.path.join(output_dir, chart.get("staticName"))
                if os.path.exists(image_path):
                    fig, ax = plt.subplots(figsize=(11, 7))
                    ax.imshow(plt.imread(image_path))
                    ax.axis("off")
                    ax.set_title(chart.get("title") or "")
                    pdf.savefig(fig, bbox_inches="tight")
                    plt.close(fig)
    exports.append({"name": pdf_name, "label": "PDF report", "mimeType": "application/pdf"})
    excel_name = "analysis-summary.xlsx"
    excel_path = os.path.join(output_dir, excel_name)
    try:
        with pd.ExcelWriter(excel_path) as writer:
            for key, df in frames.items():
                df.head(5000).to_excel(writer, sheet_name=key[:31] or "data", index=False)
            summary_rows = []
            for result in results:
                for insight in result.get("insights", []):
                    summary_rows.append({"dataset": result.get("name"), "insight": insight})
            pd.DataFrame(summary_rows).to_excel(writer, sheet_name="insights", index=False)
        exports.append({"name": excel_name, "label": "Excel summary", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
    except Exception as error:
        exports.append({"name": "", "label": "Excel export unavailable: " + str(error), "mimeType": ""})
    return exports

def artifact_mime_type(file_name):
    lower = file_name.lower()
    if lower.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lower.endswith(".csv"):
        return "text/csv"
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith(".html"):
        return "text/html"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"

def build_basic_result(name, frame, charts):
    pd_module = globals().get("pd")
    item = {
        "name": name,
        "shape": {"rows": 0, "columns": 0},
        "columns": [],
        "sample": [],
        "charts": charts
    }
    if pd_module is not None and isinstance(frame, pd_module.DataFrame):
        item["shape"] = {"rows": int(frame.shape[0]), "columns": int(frame.shape[1])}
        item["columns"] = [str(column) for column in frame.columns]
        item["sample"] = frame_sample(frame)
    return item

def discover_generated_outputs():
    existing_exports = set()
    exports = []
    for item in analysis_exports:
        name = item.get("name") or ""
        if name:
            existing_exports.add(name)
        exports.append(item)
    chart_map = {}
    for index, chart in enumerate(analysis_charts):
        static_name = chart.get("staticName") or ""
        interactive_name = chart.get("interactiveName") or ""
        key_name = static_name or interactive_name or "chart_" + str(index + 1)
        key = os.path.splitext(os.path.basename(key_name))[0]
        chart_map[key] = {
            "title": chart.get("title") or "Analysis Chart",
            "type": chart.get("type") or "chart",
            "staticName": static_name,
            "interactiveName": interactive_name
        }
    for file_name in os.listdir(output_dir):
        lower = file_name.lower()
        file_path = os.path.join(output_dir, file_name)
        if not os.path.isfile(file_path):
            continue
        if lower in ["analysis.py", "user_analysis.py", "meta.json", "deepchat_excel_formula_engine.py"]:
            continue
        stem = os.path.splitext(file_name)[0]
        if lower.endswith((".png", ".jpg", ".jpeg", ".webp")):
            current = chart_map.get(stem, {"title": stem.replace("_", " ").title(), "type": "chart", "staticName": "", "interactiveName": ""})
            current["staticName"] = file_name
            chart_map[stem] = current
        elif lower.endswith(".html"):
            current = chart_map.get(stem, {"title": stem.replace("_", " ").title(), "type": "interactive", "staticName": "", "interactiveName": ""})
            current["interactiveName"] = file_name
            chart_map[stem] = current
        elif lower.endswith((".xlsx", ".csv", ".json")) and file_name not in existing_exports:
            exports.append({"name": file_name, "label": file_name, "mimeType": artifact_mime_type(file_name)})
            existing_exports.add(file_name)
    workbook_preview = None
    for export_item in exports:
        export_name = export_item.get("name") or ""
        export_mime = export_item.get("mimeType") or ""
        if export_name.lower().endswith(".xlsx") or "spreadsheet" in export_mime or "excel" in export_mime:
            workbook_preview = build_workbook_preview(os.path.join(output_dir, export_name), export_name)
            break
    return list(chart_map.values()), exports, workbook_preview

try:
    files = payload.get("files") or []
    prompt = payload.get("prompt") or ""
    user_code = payload.get("code") or ""
    display_code = payload.get("displayCode") or user_code
    results = []
    frames = {}
    stdout_items = []

    sources = []
    for item in files:
        sources.append((item.get("name") or "dataset", read_dataset(item)))

    for index, source in enumerate(sources):
        source_name, original = source
        original.columns = [str(column) for column in original.columns]
        safe_name = "dataset_" + str(index + 1)
        frames[safe_name] = original
        frames[source_name or safe_name] = original
    runtime_dataframes = frames

    if not user_code.strip():
        raise ValueError("No Python code was provided by the model.")

    execution_stdout = io.StringIO()
    user_script_path = os.path.join(output_dir, "user_analysis.py")
    with open(user_script_path, "w", encoding="utf-8") as handle:
        handle.write(user_code)
    scope = {
        "os": os,
        "json": json,
        "math": math,
        "re": re,
        "Workbook": Workbook,
        "load_workbook": load_workbook,
        "BarChart": BarChart,
        "LineChart": LineChart,
        "Reference": Reference,
        "Alignment": Alignment,
        "Font": Font,
        "PatternFill": PatternFill,
        "Table": Table,
        "TableStyleInfo": TableStyleInfo,
        "get_column_letter": get_column_letter,
        "dataframes": frames,
        "input_files": files,
        "output_dir": output_dir,
        "install_package": install_package,
        "save_excel_workbook": save_excel_workbook,
        "save_current_matplotlib_chart": save_current_matplotlib_chart,
        "save_plotly_chart": save_plotly_chart
    }
    if "pd" in globals():
        scope["pd"] = pd
        scope["df"] = next(iter(frames.values())) if frames else pd.DataFrame()
    if "np" in globals():
        scope["np"] = np
    if "plt" in globals():
        scope["plt"] = plt
    if "sns" in globals():
        scope["sns"] = sns
    if "px" in globals():
        scope["px"] = px
    with contextlib.redirect_stdout(execution_stdout):
        enable_filesystem_guard()
        executed_scope = runpy.run_path(user_script_path, init_globals=scope)
    printed = execution_stdout.getvalue().strip()
    if printed:
        stdout_items.append(printed)
    if "plt" in globals() and plt.get_fignums():
        save_current_matplotlib_chart("AI Generated Chart", "chart")
    if "result" in executed_scope:
        stdout_items.append(clean_value(executed_scope["result"]))
    charts, exports, workbook_preview = discover_generated_outputs()
    seen_frames = set()
    for frame_name, frame in frames.items():
        frame_key = id(frame)
        if frame_key in seen_frames:
            continue
        seen_frames.add(frame_key)
        results.append(build_basic_result(frame_name, frame, charts if not results else []))
    if not results:
        results.append({"name": "Generated Output", "shape": {"rows": 0, "columns": 0}, "columns": [], "sample": [], "charts": charts})
    response = {
        "success": True,
        "title": "Excel Workbook" if wants_spreadsheet else "Data Analysis",
        "prompt": prompt,
        "datasets": results,
        "exports": exports,
        "workbookPreview": workbook_preview,
        "runtime": runtime_manifest,
        "stdout": stdout_items,
        "warnings": [] if has_sklearn or analysis_mode != "analysis" else ["scikit-learn is unavailable, so clustering was skipped."],
        "execution": {
            "code": display_code,
            "stdout": "\n".join([str(item) for item in stdout_items]) or "Python analysis completed.",
            "stderr": ""
        }
    }
    print(marker + json.dumps(clean_value(response), ensure_ascii=False))
except Exception:
    print(marker + json.dumps({
        "success": False,
        "error": traceback.format_exc()
    }))
`;

const runPythonAnalysis = (python: string, input: Record<string, unknown>, scriptPath: string, outputDir: string, signal: AbortSignal) => new Promise<{ stdout: string; stderr: string; timedOut: boolean; exitCode: number | null }>((resolve) => {
  const runTempDir = join(outputDir, '.tmp');
  const child = spawn(python, [scriptPath], {
    cwd: outputDir,
    shell: false,
    windowsHide: true,
    env: getRunnerEnvironment(getRuntimeEnv(runTempDir))
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
    resolve({ stdout, stderr, timedOut, exitCode });
  };
  const abortRun = () => {
    child.kill('SIGKILL');
    finish(null);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 60000);
  signal.addEventListener('abort', abortRun);
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString('utf8');
  });
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString('utf8');
  });
  child.on('error', (error) => {
    stderr += getMessage(error);
    finish(null);
  });
  child.on('close', (code) => finish(code));
  child.stdin.write(JSON.stringify(input));
  child.stdin.end();
});

const parsePythonResult = (stdout: string) => {
  const index = stdout.lastIndexOf(RESULT_MARKER);
  if (index === -1) {
    return null;
  }
  const jsonText = stdout.slice(index + RESULT_MARKER.length).trim();
  return JSON.parse(jsonText) as Record<string, unknown>;
};

const combineOutput = (stderr: string, stdout: string) => [stderr, stdout].filter(Boolean).join('\n').trim();

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = normalizeRuntimeMode(url.searchParams.get('mode'));
    await cleanupAnalysisWorkspace();
    const manifestDir = join(ANALYSIS_ROOT, '_manifest');
    await mkdir(manifestDir, { recursive: true });
    const python = await ensurePythonDataStack(manifestDir, mode);
    const manifest = await getPythonRuntimeManifest(python, manifestDir, mode);
    return NextResponse.json({
      success: true,
      ...manifest,
      helpers: mode === 'excel_light'
        ? ['Workbook', 'load_workbook', 'BarChart', 'LineChart', 'Reference']
        : mode === 'table'
          ? ['pd', 'np', 'save_excel_workbook']
          : ['pd', 'np', 'plt', 'sns', 'px', 'save_current_matplotlib_chart', 'save_plotly_chart', 'install_package']
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json() as AnalysisPayload;
    const runId = randomUUID();
    await cleanupAnalysisWorkspace(runId);
    const outputDir = join(ANALYSIS_ROOT, runId);
    await mkdir(outputDir, { recursive: true });
    await mkdir(join(outputDir, '.tmp'), { recursive: true });
    await writeFile(join(outputDir, 'meta.json'), JSON.stringify({
      chatId: typeof payload.chatId === 'string' ? payload.chatId : '',
      createdAt: new Date().toISOString(),
      runtime: {
        mode: 'local-venv',
        workspace: outputDir,
        python: RUNTIME_VENV_PYTHON
      }
    }, null, 2), 'utf8');
    const promptText = typeof payload.prompt === 'string' ? payload.prompt : '';
    const payloadCode = typeof payload.code === 'string' ? payload.code : '';
    const wantsSpreadsheet = /\b(excel|spreadsheet|workbook|xlsx|table|tabel|lembar kerja|rumus|formula|cashflow|cash flow|arus kas)\b/i.test(promptText);
    const requestedMode = normalizeRuntimeMode(payload.analysisMode);
    const pythonMode = requestedMode;
    const python = await ensurePythonDataStack(outputDir, pythonMode);
    const runtimeManifest = await getPythonRuntimeManifest(python, outputDir, pythonMode);
    const scriptPath = join(outputDir, 'analysis.py');
    const formulaEnginePath = join(outputDir, 'deepchat_excel_formula_engine.py');
    await writeFile(formulaEnginePath, excelFormulaEngineSource, 'utf8');
    await writeFile(scriptPath, analysisScript, 'utf8');
    const files = [];
    for (const file of Array.isArray(payload.files) ? payload.files : []) {
      const resolved = await resolveAttachedFile(file);
      if (resolved) files.push(resolved);
    }
    const requestedCharts = Array.isArray(payload.requestedCharts) ? payload.requestedCharts.filter((item): item is string => typeof item === 'string') : [];
    const result = await runPythonAnalysis(python, {
      prompt: promptText,
      code: payloadCode,
      displayCode: typeof payload.displayCode === 'string' ? payload.displayCode : '',
      requestedCharts,
      analysisMode: pythonMode,
      runtimeManifest,
      files,
      wantsSpreadsheet,
      outputDir
    }, scriptPath, outputDir, req.signal);
    await Promise.allSettled([
      rm(join(outputDir, '.tmp'), { recursive: true, force: true }),
      unlink(scriptPath),
      unlink(formulaEnginePath),
      unlink(join(outputDir, 'user_analysis.py'))
    ]);
    const parsed = parsePythonResult(result.stdout);
    if (!parsed) {
      const output = combineOutput(result.stderr, result.stdout);
      return NextResponse.json({
        success: false,
        error: output || 'Python analysis did not return a valid result.',
        execution: {
          code: typeof payload.displayCode === 'string' ? payload.displayCode : typeof payload.code === 'string' ? payload.code : '',
          stdout: result.stdout,
          stderr: result.stderr || 'Python analysis did not return a valid result.'
        },
        timedOut: result.timedOut,
        exitCode: result.exitCode
      }, { status: 500 });
    }
    const datasets = Array.isArray(parsed.datasets) ? parsed.datasets.map((dataset) => {
      if (!dataset || typeof dataset !== 'object') return dataset;
      const current = dataset as Record<string, unknown>;
      const charts = Array.isArray(current.charts) ? current.charts.map((chart) => {
        if (!chart || typeof chart !== 'object') return chart;
        const item = chart as Record<string, unknown>;
        const staticName = typeof item.staticName === 'string' ? basename(item.staticName) : '';
        const interactiveName = typeof item.interactiveName === 'string' ? basename(item.interactiveName) : '';
        return {
          ...item,
          staticUrl: staticName ? getArtifactUrl(runId, staticName) : '',
          interactiveUrl: interactiveName ? getArtifactUrl(runId, interactiveName) : ''
        };
      }) : [];
      return { ...current, charts };
    }) : [];
    const exports = Array.isArray(parsed.exports) ? parsed.exports.map((artifact) => {
      if (!artifact || typeof artifact !== 'object') return artifact;
      const item = artifact as Record<string, unknown>;
      const name = typeof item.name === 'string' ? basename(item.name) : '';
      return {
        ...item,
        url: name ? getArtifactUrl(runId, name, true) : ''
      };
    }) : [];
    const parsedExecution = parsed.execution && typeof parsed.execution === 'object' ? parsed.execution as Record<string, unknown> : null;
    const execution = {
      code: typeof parsedExecution?.code === 'string' ? parsedExecution.code : typeof payload.displayCode === 'string' ? payload.displayCode : typeof payload.code === 'string' ? payload.code : '',
      stdout: typeof parsedExecution?.stdout === 'string' ? parsedExecution.stdout : '',
      stderr: typeof parsedExecution?.stderr === 'string' ? parsedExecution.stderr : typeof parsed.error === 'string' ? parsed.error : result.stderr
    };
    return NextResponse.json({
      ...parsed,
      runId,
      datasets,
      exports,
      execution,
      stderr: result.stderr,
      timedOut: result.timedOut,
      exitCode: result.exitCode
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getMessage(error) }, { status: 500 });
  }
}
