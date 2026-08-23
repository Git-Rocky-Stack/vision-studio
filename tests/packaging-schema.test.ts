import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..');
const require_ = createRequire(import.meta.url);

/**
 * electron-builder validates every config against this schema and refuses to
 * package when an option is unknown (`additionalProperties: false` at every
 * level). Majors move and delete options - v26 pulled the whole win signing
 * block down into `win.signtoolOptions` - and the failure only surfaces at
 * package time, on CI, after the ~40 minute native backend build has already
 * run. Checking our configs against the *installed* schema turns that into a
 * unit-test failure the moment the dependency moves.
 */
const scheme = require_('app-builder-lib/scheme.json') as SchemaNode;

interface SchemaNode {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
  items?: SchemaNode;
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  definitions?: Record<string, SchemaNode>;
}

/** Follow a local `#/definitions/Name` pointer. */
function deref(node: SchemaNode): SchemaNode {
  if (!node.$ref) return node;
  const name = node.$ref.replace('#/definitions/', '');
  const target = scheme.definitions?.[name];
  if (!target) throw new Error(`Unresolvable schema ref: ${node.$ref}`);
  return deref(target);
}

/**
 * Collect every object-shaped alternative a schema node allows. A property is
 * frequently `anyOf: [{ $ref: Foo }, { type: 'null' }]`, and a key is legal if
 * ANY branch accepts it.
 */
function objectBranches(node: SchemaNode): SchemaNode[] {
  const resolved = deref(node);
  const unions = resolved.anyOf ?? resolved.oneOf ?? resolved.allOf;
  if (unions) return unions.flatMap(objectBranches);
  return resolved.properties ? [resolved] : [];
}

/**
 * Walk a config value against its schema node and record the dotted path of
 * every key the schema does not define. Only closed objects
 * (`additionalProperties: false`) are checked - open maps such as
 * `fileAssociations` extras legitimately carry arbitrary keys.
 */
function unknownKeys(value: unknown, node: SchemaNode, path: string, found: string[]): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    const items = deref(node).items;
    if (!items) return;
    value.forEach((entry, i) => unknownKeys(entry, items, `${path}[${i}]`, found));
    return;
  }

  if (typeof value !== 'object') return;

  const branches = objectBranches(node);
  if (branches.length === 0) return;

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const accepting = branches.filter((branch) => branch.properties?.[key]);

    if (accepting.length === 0) {
      // Open branches accept anything; only flag when every branch is closed.
      if (branches.every((branch) => branch.additionalProperties === false)) {
        found.push(path ? `${path}.${key}` : key);
      }
      continue;
    }

    const child = (value as Record<string, unknown>)[key];
    for (const branch of accepting) {
      unknownKeys(child, branch.properties![key], path ? `${path}.${key}` : key, found);
    }
  }
}

function assertConformant(config: unknown, label: string): void {
  const found: string[] = [];
  unknownKeys(config, scheme, '', found);
  expect(found, `${label} uses options the installed electron-builder does not define`).toEqual([]);
}

describe('electron-builder config conforms to the installed schema', () => {
  it('accepts every option in electron-builder.yml', () => {
    assertConformant(parse(readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8')), 'electron-builder.yml');
  });

  it('accepts every option in electron-builder.windows.json', () => {
    assertConformant(
      JSON.parse(readFileSync(resolve(ROOT, 'electron-builder.windows.json'), 'utf8')),
      'electron-builder.windows.json',
    );
  });

  it('detects an option the schema does not define', () => {
    // Self-guard: a walker that silently accepts everything would make the two
    // checks above meaningless.
    const found: string[] = [];
    unknownKeys({ win: { thisOptionDoesNotExist: true } }, scheme, '', found);
    expect(found).toEqual(['win.thisOptionDoesNotExist']);
  });

  it('does not flag options the schema does define', () => {
    const found: string[] = [];
    unknownKeys({ appId: 'com.example.app', win: { target: ['zip'] } }, scheme, '', found);
    expect(found).toEqual([]);
  });
});
