export const normalizeCodeLanguage = (language = '') => language.trim().toLowerCase();

export const browserScriptLanguages = new Set(['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx']);

export const codeNeedsConsoleInput = (language: string, code: string) => {
  const normalized = normalizeCodeLanguage(language);
  const checks: Record<string, RegExp[]> = {
    python: [/\binput\s*\(/, /\bsys\.stdin\b/, /\bstdin\.read(?:line)?\s*\(/],
    py: [/\binput\s*\(/, /\bsys\.stdin\b/, /\bstdin\.read(?:line)?\s*\(/],
    javascript: [/\breadline\b/, /\bcreateInterface\s*\(/, /\bprocess\.stdin\b/, /\bprompt\s*\(/],
    js: [/\breadline\b/, /\bcreateInterface\s*\(/, /\bprocess\.stdin\b/, /\bprompt\s*\(/],
    typescript: [/\breadline\b/, /\bcreateInterface\s*\(/, /\bprocess\.stdin\b/, /\bprompt\s*\(/],
    ts: [/\breadline\b/, /\bcreateInterface\s*\(/, /\bprocess\.stdin\b/, /\bprompt\s*\(/],
    java: [/\bScanner\s*\(/, /\bSystem\.in\b/, /\bBufferedReader\s*\(/, /\breadLine\s*\(/],
    c: [/\bscanf\s*\(/, /\bfgets\s*\(/, /\bgetchar\s*\(/, /\bgets\s*\(/],
    cpp: [/\bcin\s*>>/, /\bgetline\s*\(/, /\bscanf\s*\(/],
    'c++': [/\bcin\s*>>/, /\bgetline\s*\(/, /\bscanf\s*\(/],
    go: [/\bfmt\.Scan/, /\bbufio\.NewReader\s*\(/, /\bos\.Stdin\b/],
    rust: [/\bread_line\s*\(/, /\bstd::io::stdin\b/, /\bio::stdin\b/],
    ruby: [/\bgets\b/, /\bSTDIN\b/, /\breadline\b/],
    rb: [/\bgets\b/, /\bSTDIN\b/, /\breadline\b/],
    php: [/\bfgets\s*\(\s*STDIN/, /\bSTDIN\b/, /\breadline\s*\(/],
    bash: [/(^|\s)read(\s|$)/m],
    shell: [/(^|\s)read(\s|$)/m],
    sh: [/(^|\s)read(\s|$)/m],
    powershell: [/\bRead-Host\b/, /\[Console\]::ReadLine\s*\(/],
    ps1: [/\bRead-Host\b/, /\[Console\]::ReadLine\s*\(/]
  };
  return (checks[normalized] || [/\b(stdin|input|readline|scanf|ReadLine|Read-Host)\b/]).some((pattern) => pattern.test(code));
};

export const codeUsesEcmaModules = (code: string) => /(^|\n)\s*import\s+(?:[\w*{]|['"])|(^|\n)\s*export\s+/m.test(code);
