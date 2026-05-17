import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import { basename, join, normalize, sep } from 'path';
import { NextResponse } from 'next/server';
import { getRunnerEnvironment } from '@/lib/code-runner-security';

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
  files?: AttachedFileInput[];
};

const ANALYSIS_ROOT = join(process.cwd(), 'data', 'analysis');
const TEMP_FILE_ROOT = join(process.cwd(), 'data', 'temp', 'file');
const RESULT_MARKER = '__DEEPCHAT_ANALYSIS_RESULT__';
const DATA_EXTENSIONS = new Set(['csv', 'json', 'jsonl', 'xlsx', 'xls']);
const PYTHON_IMPORTS = ['pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'openpyxl', 'sklearn'];
const PIP_PACKAGES = ['pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly', 'openpyxl', 'scikit-learn'];

let pythonStackReady = false;

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

const getArtifactUrl = (runId: string, artifactName: string, download = false) => {
  const params = new URLSearchParams({ runId, name: artifactName });
  if (download) params.set('download', '1');
  return `/api/code/analysis/artifact?${params.toString()}`;
};

const runProcess = (command: string, args: string[], cwd: string, input = '', timeoutMs = 300000) => new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    env: getRunnerEnvironment()
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

const getPythonCommand = () => {
  const candidates = [
    process.env.DEEPCHAT_PYTHON,
    join(process.env.USERPROFILE || '', 'miniconda3', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    'python'
  ].filter((item): item is string => Boolean(item));
  return candidates.find(candidate => candidate === 'python' || existsSync(candidate)) || 'python';
};

const ensurePythonDataStack = async (cwd: string) => {
  const python = getPythonCommand();
  if (pythonStackReady) return python;
  const importCode = [
    'import importlib, json',
    `packages = ${JSON.stringify(PYTHON_IMPORTS)}`,
    'missing = []',
    'for package in packages:',
    '    try:',
    '        importlib.import_module(package)',
    '    except Exception:',
    '        missing.append(package)',
    'print(json.dumps(missing))'
  ].join('\n');
  const firstCheck = await runProcess(python, ['-c', importCode], cwd, '', 60000);
  let missing: string[] = [];
  try {
    missing = JSON.parse(firstCheck.stdout.trim() || '[]');
  } catch {
    missing = PYTHON_IMPORTS;
  }
  if (missing.length === 0) {
    pythonStackReady = true;
    return python;
  }
  await runProcess(python, ['-m', 'pip', 'install', ...PIP_PACKAGES], cwd, '', 600000);
  const secondCheck = await runProcess(python, ['-c', importCode], cwd, '', 60000);
  try {
    missing = JSON.parse(secondCheck.stdout.trim() || '[]');
  } catch {
    missing = PYTHON_IMPORTS;
  }
  if (missing.length > 0) {
    throw new Error(`Automatic Python dependency setup failed for: ${missing.join(', ')}`);
  }
  pythonStackReady = true;
  return python;
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
import subprocess
import sys
import traceback
import warnings

warnings.filterwarnings("ignore")
marker = "__DEEPCHAT_ANALYSIS_RESULT__"
required = ["pandas", "numpy", "matplotlib", "seaborn", "plotly", "openpyxl", "sklearn"]
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

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.io as pio
import seaborn as sns
from matplotlib.backends.backend_pdf import PdfPages
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
    has_sklearn = True
except Exception:
    has_sklearn = False

payload = json.loads(sys.stdin.read() or "{}")
output_dir = payload.get("outputDir") or os.getcwd()
requested_charts = payload.get("requestedCharts") or []
wants_spreadsheet = bool(payload.get("wantsSpreadsheet"))
os.makedirs(output_dir, exist_ok=True)
sns.set_theme(style="whitegrid", palette="deep")
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
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
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
    if not sources:
        sources.append(("Prompt Generated Analysis Dataset", make_prompt_dataset(prompt)))

    for index, source in enumerate(sources):
        source_name, original = source
        original.columns = [str(column) for column in original.columns]
        detect_datetime_columns(original)
        df, missing_report = impute_dataframe(original)
        numeric, categorical, datetime_columns = describe_columns(df)
        safe_name = "dataset_" + str(index + 1)
        stats = statistical_summary(df, numeric)
        correlations = correlation_summary(df, numeric)
        regression = regression_summary(df, numeric)
        clusters = clustering_summary(df, numeric)
        outliers = outlier_summary(df, numeric)
        trends = trend_summary(df, numeric, datetime_columns)
        charts = [] if user_code or wants_spreadsheet else build_charts(df, safe_name, numeric, categorical, datetime_columns)
        name = source_name or safe_name
        result = {
            "name": name,
            "shape": {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
            "columns": list(df.columns),
            "sample": frame_sample(df),
            "missing": missing_report,
            "statistics": stats,
            "correlation": correlations,
            "regression": regression,
            "clustering": clusters,
            "outliers": outliers,
            "trends": trends,
            "charts": charts
        }
        results.append(result)
        frames[safe_name] = df
    runtime_dataframes = frames

    if user_code:
        execution_stdout = io.StringIO()
        scope = {
            "pd": pd,
            "np": np,
            "plt": plt,
            "sns": sns,
            "px": px,
            "dataframes": frames,
            "df": next(iter(frames.values())) if frames else pd.DataFrame(),
            "input_files": files,
            "results": results,
            "output_dir": output_dir,
            "install_package": install_package,
            "save_excel_workbook": save_excel_workbook,
            "save_current_matplotlib_chart": save_current_matplotlib_chart,
            "save_plotly_chart": save_plotly_chart
        }
        with contextlib.redirect_stdout(execution_stdout):
            enable_filesystem_guard()
            exec(user_code, scope)
        printed = execution_stdout.getvalue().strip()
        if printed:
            stdout_items.append(printed)
        if plt.get_fignums():
            save_current_matplotlib_chart("AI Generated Chart", "chart")
        if analysis_charts and results:
            results[0]["charts"] = analysis_charts + results[0].get("charts", [])
        if not analysis_charts and results and not wants_spreadsheet:
            first_df = next(iter(frames.values())) if frames else pd.DataFrame()
            numeric, categorical, datetime_columns = describe_columns(first_df)
            results[0]["charts"] = build_charts(first_df, "dataset_1", numeric, categorical, datetime_columns)
        if "result" in scope:
            stdout_items.append(clean_value(scope["result"]))

    if wants_spreadsheet and not analysis_exports:
        save_excel_workbook("analysis-table.xlsx", frames)
    exports = analysis_exports
    response = {
        "success": True,
        "title": "Spreadsheet Preview" if wants_spreadsheet else "Data Analysis",
        "prompt": prompt,
        "datasets": results,
        "exports": exports,
        "stdout": stdout_items,
        "warnings": [] if has_sklearn else ["scikit-learn is unavailable, so clustering was skipped."],
        "execution": {
            "code": display_code,
            "stdout": "\n".join([str(item) for item in stdout_items]) or "Generated " + str(sum(len(result.get("charts", [])) for result in results)) + " chart(s).",
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
  const child = spawn(python, [scriptPath], {
    cwd: outputDir,
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

export async function POST(req: Request) {
  try {
    const payload = await req.json() as AnalysisPayload;
    const runId = randomUUID();
    const outputDir = join(ANALYSIS_ROOT, runId);
    await mkdir(outputDir, { recursive: true });
    const python = await ensurePythonDataStack(outputDir);
    const scriptPath = join(outputDir, 'analysis.py');
    await writeFile(scriptPath, analysisScript, 'utf8');
    const files = [];
    for (const file of Array.isArray(payload.files) ? payload.files : []) {
      const resolved = await resolveAttachedFile(file);
      if (resolved) files.push(resolved);
    }
    const requestedCharts = Array.isArray(payload.requestedCharts) ? payload.requestedCharts.filter((item): item is string => typeof item === 'string') : [];
    const result = await runPythonAnalysis(python, {
      prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
      code: typeof payload.code === 'string' ? payload.code : '',
      displayCode: typeof payload.displayCode === 'string' ? payload.displayCode : '',
      requestedCharts,
      files,
      wantsSpreadsheet: typeof payload.prompt === 'string' && /\b(excel|spreadsheet|workbook|xlsx|table|tabel|lembar kerja|rumus|formula)\b/i.test(payload.prompt),
      outputDir
    }, scriptPath, outputDir, req.signal);
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
