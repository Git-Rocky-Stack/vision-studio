/**
 * Prompt-list import for the Batch queue (#J14).
 *
 * - `.txt`: one prompt per line; blank lines are skipped.
 * - `.csv`: the first column of every row (RFC 4180 quoting, so a prompt may
 *   contain commas, quotes and line breaks). A header row whose first cell is
 *   `prompt` is skipped.
 * - `.json`: an array of prompt strings, an array of `{ prompt }` objects, or
 *   the Batch panel's own export (`{ prompts: [...], settings: {...} }`), whose
 *   settings come back too so an export round-trips.
 */

export interface ImportedBatchSettings {
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  model?: string;
}

export interface BatchPromptImport {
  prompts: string[];
  settings?: ImportedBatchSettings;
}

export type BatchPromptFormat = 'txt' | 'csv' | 'json';

export const BATCH_IMPORT_ACCEPT = '.txt,.csv,.json,text/plain,text/csv,application/json';
/** Larger files are refused before they are read: a prompt list is kilobytes. */
export const BATCH_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const BATCH_IMPORT_MAX_PROMPTS = 1000;

export class BatchPromptImportError extends Error {}

export function detectBatchPromptFormat(fileName: string): BatchPromptFormat | null {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'txt' || extension === 'csv' || extension === 'json') return extension;
  return null;
}

function cleanPrompts(values: unknown[]): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseTxt(text: string): BatchPromptImport {
  return { prompts: cleanPrompts(text.split(/\r\n|\r|\n/)) };
}

/** RFC 4180 rows: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (inQuotes) throw new BatchPromptImportError('The CSV file has an unclosed quoted field.');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsv(text: string): BatchPromptImport {
  const rows = parseCsvRows(text);
  const firstCells = rows.map((row) => row[0] ?? '');
  if (firstCells.length > 0 && firstCells[0].trim().toLowerCase() === 'prompt') firstCells.shift();
  return { prompts: cleanPrompts(firstCells) };
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readSettings(value: unknown): ImportedBatchSettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const settings: ImportedBatchSettings = {
    width: readFiniteNumber(record.width),
    height: readFiniteNumber(record.height),
    steps: readFiniteNumber(record.steps),
    cfgScale: readFiniteNumber(record.cfgScale),
    model: typeof record.model === 'string' && record.model.trim() ? record.model.trim() : undefined,
  };
  const defined = Object.fromEntries(
    Object.entries(settings).filter(([, entry]) => entry !== undefined),
  ) as ImportedBatchSettings;
  return Object.keys(defined).length > 0 ? defined : undefined;
}

function promptsFromArray(values: unknown[]): string[] {
  return cleanPrompts(
    values.map((value) =>
      value && typeof value === 'object' ? (value as { prompt?: unknown }).prompt : value,
    ),
  );
}

function parseJson(text: string): BatchPromptImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BatchPromptImportError('The JSON file could not be parsed.');
  }
  if (Array.isArray(data)) return { prompts: promptsFromArray(data) };
  if (data && typeof data === 'object' && Array.isArray((data as { prompts?: unknown }).prompts)) {
    const record = data as { prompts: unknown[]; settings?: unknown };
    const settings = readSettings(record.settings);
    return { prompts: promptsFromArray(record.prompts), ...(settings ? { settings } : {}) };
  }
  throw new BatchPromptImportError(
    'The JSON file must be an array of prompts or an object with a "prompts" array.',
  );
}

/**
 * Parses an imported prompt file. Throws BatchPromptImportError with a
 * user-facing message for an unsupported type, malformed content, or a file
 * with no prompts.
 */
export function parseBatchPromptFile(fileName: string, text: string): BatchPromptImport {
  const format = detectBatchPromptFormat(fileName);
  if (!format) {
    throw new BatchPromptImportError('Import a .txt (one prompt per line), .csv or .json file.');
  }
  const parsed = format === 'txt' ? parseTxt(text) : format === 'csv' ? parseCsv(text) : parseJson(text);
  if (parsed.prompts.length === 0) {
    throw new BatchPromptImportError('The file has no prompts to import.');
  }
  if (parsed.prompts.length > BATCH_IMPORT_MAX_PROMPTS) {
    throw new BatchPromptImportError(
      `The file has ${parsed.prompts.length} prompts; import at most ${BATCH_IMPORT_MAX_PROMPTS} at a time.`,
    );
  }
  return parsed;
}
