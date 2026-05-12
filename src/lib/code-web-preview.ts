import { browserScriptLanguages, normalizeCodeLanguage } from '@/lib/code-runner-detection';

export type WebPreviewSource = {
  kind: 'html' | 'svg' | 'css' | 'none';
  code: string;
};

const htmlLanguages = new Set(['html', 'htm']);
const svgLanguages = new Set(['svg']);
const cssLanguages = new Set(['css', 'scss', 'sass', 'less']);
const templateLanguages = new Set([
  'vue',
  'svelte',
  'astro',
  'ejs',
  'erb',
  'hbs',
  'handlebars',
  'mustache',
  'twig',
  'liquid',
  'blade',
  'jinja',
  'jinja2',
  'django-html',
  'cshtml',
  'razor'
]);
const serverWebLanguages = new Set([
  'javascript',
  'js',
  'typescript',
  'ts',
  'python',
  'py',
  'php',
  'ruby',
  'rb',
  'java',
  'go',
  'rust',
  'csharp',
  'cs',
  'kotlin',
  'kt',
  'scala',
  'dart',
  'elixir',
  'ex',
  'exs',
  'clojure',
  'clj'
]);

const htmlTagPattern = /<(!doctype|html|head|body|style|script|div|section|main|button|canvas|svg|form|input|nav|article|header|footer|h[1-6]|p|a|ul|ol|li|table|template)[\s>]/i;
const fullHtmlPattern = /(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*?<\/html>/i;
const svgPattern = /<svg\b[\s\S]*?<\/svg>/i;
const serverWebPattern = /\b(Flask|fastapi|FastAPI|Django|render_template|render_template_string|HTMLResponse|HttpResponse|Response\(|make_response|Bottle|express|app\.(get|post|put|patch|delete|use)|router\.(get|post|put|patch|delete|use)|res\.(send|render|end)|createServer|Sinatra|Rails|Rack|SpringBootApplication|Controller|RestController|HttpServlet|net\/http|http\.HandleFunc|gin\.Default|fiber\.New|echo\.New|actix_web|rocket::|warp::|axum|Phoenix|Plug\.Conn)\b/i;

const stringDelimiters = ['"""', "'''", '`', '"', "'"];

const unescapeTemplate = (value: string) => value
  .replace(/\\r/g, '\r')
  .replace(/\\n/g, '\n')
  .replace(/\\t/g, '\t')
  .replace(/\\"/g, '"')
  .replace(/\\'/g, "'")
  .replace(/\\`/g, '`')
  .trim();

const scoreHtml = (value: string) => {
  let score = value.length;
  if (fullHtmlPattern.test(value)) score += 10000;
  if (/<body[\s>]/i.test(value)) score += 1000;
  if (/<style[\s>]/i.test(value)) score += 500;
  if (/<script[\s>]/i.test(value)) score += 350;
  if (/<main[\s>]|<section[\s>]|<form[\s>]/i.test(value)) score += 200;
  return score;
};

const readDelimitedString = (code: string, start: number, delimiter: string) => {
  let index = start + delimiter.length;
  let value = '';
  while (index < code.length) {
    if (code.startsWith(delimiter, index)) {
      return { value, end: index + delimiter.length };
    }
    const char = code[index];
    if (delimiter.length === 1 && char === '\\') {
      value += char;
      if (index + 1 < code.length) {
        value += code[index + 1];
        index += 2;
        continue;
      }
    }
    value += char;
    index += 1;
  }
  return null;
};

const extractDelimitedHtml = (code: string) => {
  const matches: string[] = [];
  let index = 0;
  while (index < code.length) {
    const delimiter = stringDelimiters.find((item) => code.startsWith(item, index));
    if (!delimiter) {
      index += 1;
      continue;
    }
    const result = readDelimitedString(code, index, delimiter);
    if (!result) {
      index += delimiter.length;
      continue;
    }
    const value = unescapeTemplate(result.value);
    if (htmlTagPattern.test(value)) matches.push(value);
    index = result.end;
  }
  return matches.sort((left, right) => scoreHtml(right) - scoreHtml(left))[0] || '';
};

const stripPhpBlocks = (code: string) => code.replace(/<\?(?:php|=)?[\s\S]*?\?>/gi, '').trim();

const stripTemplateCodeBlocks = (code: string) => code
  .replace(/^---[\s\S]*?---\s*/m, '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[\s\S]*?<\/style>/gi, '')
  .trim();

const extractTemplateMarkup = (code: string) => {
  const templateMatch = code.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i);
  if (templateMatch && templateMatch[1] && htmlTagPattern.test(templateMatch[1])) {
    return templateMatch[1].trim();
  }
  const stripped = stripTemplateCodeBlocks(code);
  return htmlTagPattern.test(stripped) ? stripped : '';
};

const extractFullHtml = (code: string) => {
  const match = code.match(fullHtmlPattern);
  return match ? match[0].trim() : '';
};

const extractSvg = (code: string) => {
  const match = code.match(svgPattern);
  return match ? match[0].trim() : '';
};

export const escapeStyleText = (code: string) => code.replace(/<\/style/gi, '<\\/style');

export const isCssPreviewLanguage = (language: string) => cssLanguages.has(normalizeCodeLanguage(language));

export const isServerWebLanguage = (language: string) => serverWebLanguages.has(normalizeCodeLanguage(language));

export const buildCssPreviewMarkup = (code: string) => `<style>${escapeStyleText(code)}</style><main class="deepchat-css-preview"><section class="hero"><span class="badge">CSS Preview</span><h1>Visual Preview</h1><p>Typography, spacing, colors, buttons, forms, lists, and cards use the CSS from this code block.</p><div class="actions"><button>Primary Action</button><a href="#">Text Link</a></div></section><section class="cards"><article class="card"><h2>Card Title</h2><p>This sample helps class and element selectors show up immediately.</p></article><article class="card active"><h2>Active State</h2><p>Use hover, border, background, and layout rules to check the design.</p></article></section><form><label>Name<input value="DeepChat" readonly></label><label>Message<textarea readonly>Preview content</textarea></label></form><ul><li>Responsive layout</li><li>Readable text</li><li>Interactive controls</li></ul></main>`;

export const extractWebPreviewSource = (code: string, language: string): WebPreviewSource => {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (svgLanguages.has(normalizedLanguage)) {
    return { kind: 'svg', code };
  }
  if (cssLanguages.has(normalizedLanguage)) {
    return { kind: 'css', code };
  }
  if (htmlLanguages.has(normalizedLanguage)) {
    return { kind: 'html', code };
  }
  if (templateLanguages.has(normalizedLanguage)) {
    const markup = extractTemplateMarkup(code);
    if (markup) {
      return { kind: 'html', code: markup };
    }
  }
  const fullHtml = extractFullHtml(code);
  if (fullHtml) {
    return { kind: 'html', code: fullHtml };
  }
  const svg = extractSvg(code);
  if (svg) {
    return { kind: 'svg', code: svg };
  }
  if (browserScriptLanguages.has(normalizedLanguage) && !['jsx', 'tsx'].includes(normalizedLanguage) && !serverWebPattern.test(code)) {
    return { kind: 'none', code: '' };
  }
  if (normalizedLanguage === 'php') {
    const html = stripPhpBlocks(code);
    if (htmlTagPattern.test(html)) {
      return { kind: 'html', code: html };
    }
  }
  const html = extractDelimitedHtml(code);
  if (html) {
    return { kind: 'html', code: html };
  }
  return { kind: 'none', code: '' };
};

export const isWebPreviewCode = (language: string, code: string) => {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (htmlLanguages.has(normalizedLanguage) || svgLanguages.has(normalizedLanguage) || cssLanguages.has(normalizedLanguage)) return true;
  if (extractWebPreviewSource(code, normalizedLanguage).kind !== 'none') return true;
  if (browserScriptLanguages.has(normalizedLanguage)) {
    return /\b(document|window|localStorage|sessionStorage|customElements)\b|querySelector|getElementById|addEventListener|createElement|innerHTML|appendChild|ReactDOM|createRoot|<\w+[\s>]/.test(code);
  }
  if (serverWebLanguages.has(normalizedLanguage)) {
    return serverWebPattern.test(code) && htmlTagPattern.test(code);
  }
  return serverWebPattern.test(code) && htmlTagPattern.test(code);
};
