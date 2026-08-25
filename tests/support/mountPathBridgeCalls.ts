import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

import ts from 'typescript';

/**
 * Finds `window.electron` accesses that run on a mount path.
 *
 * The distinction this encodes is the one stated in
 * `src/utils/electronBridge.ts`: reaching the preload bridge from an event
 * handler is safe by construction, because the handler cannot run unless
 * Electron opened the window; reaching it on a mount path is not, because that
 * code runs before anything could have noticed the bridge is missing.
 *
 * "Mount path" is decided by reachability rather than by lexical position,
 * because the shape that actually shipped was a helper declared inside a
 * `useEffect` and invoked from it - two scopes below the effect, and at the
 * same nesting depth as a listener that would have been perfectly safe. The
 * scan therefore builds a small per-file call graph:
 *
 *   roots        module scope, component/hook render bodies, and the callbacks
 *                of useEffect / useLayoutEffect / useInsertionEffect / useMemo
 *   edges        a root, or anything a root reaches, calls a function declared
 *                in the same file by name - or invokes one immediately (IIFE)
 *   flagged      an access whose innermost enclosing function is in that set
 *
 * A function that is merely *passed* somewhere - a JSX prop, addEventListener,
 * a useCallback body, a .then continuation - is never reached by an edge, so
 * it is never flagged. That is the deliberate direction of error: the scan
 * under-reports rather than demanding a guard on every one of the ~240 handler
 * call sites, which would add noise without removing a reachable failure.
 *
 * Known limits, stated rather than discovered later:
 *  - Resolution is per file and by name. A helper imported from another module
 *    and called on a mount path is not followed across the import.
 *  - Names are held in one flat map per file, so two same-named functions in
 *    different scopes resolve to whichever was collected last.
 *  - Indirect invocation (a function stored in an object and called through a
 *    property, or passed to a helper that calls it) is not an edge.
 *  - A guard does not carry from a function into a helper it calls. An effect
 *    that checks `window.electron?.x` and then calls a helper which
 *    dereferences the bridge bare is still reported. That over-reports on
 *    purpose: the helper is separately callable, so the guard protects the
 *    call site rather than the helper. `getElectronBridge()` in the helper
 *    settles it, which is the outcome this gate wants anyway.
 */

export interface AppSource {
  file: string;
  text: string;
}

export interface MountPathBridgeCall {
  file: string;
  line: number;
  reason: string;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const MOUNT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useMemo']);

type FunctionLike =
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration;

/** Module scope is a unit too, so the SourceFile stands in for it. */
type Unit = FunctionLike | ts.SourceFile;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/** The innermost function containing `node`, or the SourceFile for module scope. */
function unitOf(node: ts.Node): Unit {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (isFunctionLike(current)) return current;
    if (ts.isSourceFile(current)) return current;
    current = current.parent;
  }
  return node.getSourceFile();
}

/** A function's own name, or the `const NAME = ...` it is bound to. */
function nameOf(fn: FunctionLike): string | null {
  if ('name' in fn && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;

  const parent = fn.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return null;
}

/** React calls these itself, so their bodies run at mount without a caller in the file. */
function isComponentOrHookName(name: string | null): boolean {
  if (!name) return false;
  return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
}

function isImmediatelyInvoked(fn: FunctionLike): boolean {
  let candidate: ts.Node = fn;
  if (candidate.parent && ts.isParenthesizedExpression(candidate.parent)) {
    candidate = candidate.parent;
  }
  const parent = candidate.parent;
  return Boolean(parent && ts.isCallExpression(parent) && parent.expression === candidate);
}

/** `useEffect(() => {...})` and friends - the callback is the first argument. */
function mountHookFor(fn: FunctionLike): string | null {
  const parent = fn.parent;
  if (!parent || !ts.isCallExpression(parent) || parent.arguments[0] !== fn) return null;

  const callee = parent.expression;
  const calleeName = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;

  return calleeName && MOUNT_HOOKS.has(calleeName) ? calleeName : null;
}

/** `window.electron`, however deep the property chain continues afterwards. */
function isBridgeAccess(node: ts.Node): node is ts.PropertyAccessExpression {
  if (!ts.isPropertyAccessExpression(node)) return false;
  return ts.isIdentifier(node.expression) && node.expression.text === 'window' && node.name.text === 'electron';
}

/**
 * How a `window.electron` access reads the bridge.
 *
 * Reading the property itself never throws - `window` is always there. The
 * crash this gate exists for comes from *dereferencing* the result while it is
 * undefined, which is why `window.electron?.settings` and
 * `const e = window.electron` are both fine and `window.electron.settings` is
 * not.
 */
type AccessKind = 'bare-dereference' | 'optional-chained' | 'no-dereference';

function accessKind(access: ts.PropertyAccessExpression): AccessKind {
  const parent = access.parent;
  if (!parent) return 'no-dereference';

  const dereferences =
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === access;
  if (!dereferences) return 'no-dereference';

  return parent.questionDotToken ? 'optional-chained' : 'bare-dereference';
}

/**
 * Walk a unit's own statements, stopping at any nested function boundary.
 *
 * Nested functions are separate units; whether they run at mount is decided by
 * whether something reaches them, not by where they were written.
 */
function walkOwnBody(unit: Unit, visit: (node: ts.Node) => void): void {
  const body = ts.isSourceFile(unit) ? unit : unit.body;
  if (!body) return;

  const descend = (node: ts.Node) => {
    if (node !== body && isFunctionLike(node)) {
      // Not part of this unit - but an IIFE runs here and now.
      visit(node);
      return;
    }
    visit(node);
    ts.forEachChild(node, descend);
  };

  ts.forEachChild(body, descend);
}

function analyseSource({ file, text }: AppSource): MountPathBridgeCall[] {
  // Parsing all 261 renderer sources with the TypeScript compiler cost enough
  // to blow the 5s test timeout when the full suite runs them in parallel -
  // which is where this gate has to work, since that is what the pre-commit
  // hook runs. 39 files mention `electron` at all.
  //
  // The filter is on the bare identifier rather than on `window.electron`
  // precisely so it cannot create a blind spot: any access this scan is
  // looking for contains that substring somewhere, whatever the whitespace
  // between `window`, the dot and the property.
  if (!text.includes('electron')) return [];

  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const localFunctions = new Map<string, FunctionLike>();
  const units: FunctionLike[] = [];
  const dereferences: ts.PropertyAccessExpression[] = [];
  const guards: ts.PropertyAccessExpression[] = [];

  const collect = (node: ts.Node) => {
    if (isFunctionLike(node)) {
      units.push(node);
      const name = nameOf(node);
      if (name) localFunctions.set(name, node);
    }
    if (isBridgeAccess(node)) {
      const kind = accessKind(node);
      if (kind === 'bare-dereference') dereferences.push(node);
      if (kind === 'optional-chained') guards.push(node);
    }
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(sourceFile, collect);

  // Nothing to say about a file that never dereferences the bridge bare.
  if (dereferences.length === 0) return [];

  const reasons = new Map<Unit, string>();
  const queue: Unit[] = [];

  const markReachable = (unit: Unit, reason: string) => {
    if (reasons.has(unit)) return;
    reasons.set(unit, reason);
    queue.push(unit);
  };

  markReachable(sourceFile, 'module top level');
  for (const fn of units) {
    const hook = mountHookFor(fn);
    if (hook) {
      markReachable(fn, `${hook} callback`);
    } else if (isComponentOrHookName(nameOf(fn))) {
      markReachable(fn, `render body of ${nameOf(fn)}`);
    }
  }

  while (queue.length > 0) {
    const unit = queue.shift();
    if (!unit) break;
    const reason = reasons.get(unit) ?? 'mount path';

    walkOwnBody(unit, (node) => {
      if (isFunctionLike(node)) {
        if (isImmediatelyInvoked(node)) markReachable(node, `invoked immediately on ${reason}`);
        return;
      }
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;

      const callee = localFunctions.get(node.expression.text);
      if (callee) markReachable(callee, `called by ${reason}`);
    });
  }

  const found: MountPathBridgeCall[] = [];
  for (const access of dereferences) {
    const unit = unitOf(access);
    const reason = reasons.get(unit);
    if (!reason) continue;

    // An `if (!window.electron?.x) return;` earlier in the same function has
    // already taken the missing-bridge case off this path. Position matters:
    // a guard written after the dereference guards nothing.
    const position = access.getStart(sourceFile);
    const guarded = guards.some(
      (guard) => unitOf(guard) === unit && guard.getStart(sourceFile) < position
    );
    if (guarded) continue;

    const { line } = sourceFile.getLineAndCharacterOfPosition(position);
    found.push({ file, line: line + 1, reason });
  }
  return found;
}

export function findUnguardedMountPathBridgeCalls(sources: AppSource[]): MountPathBridgeCall[] {
  return sources.flatMap(analyseSource);
}

/**
 * Every renderer source the app ships, excluding test files.
 *
 * Tests define `window.electron` themselves, so a mount-path access in one is
 * describing the fixture rather than the app.
 */
export function collectAppSources(root = join(process.cwd(), 'src')): AppSource[] {
  const sources: AppSource[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(extname(entry))) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue;

      sources.push({
        file: relative(process.cwd(), absolute).split(sep).join('/'),
        text: readFileSync(absolute, 'utf8'),
      });
    }
  };

  walk(root);
  return sources;
}
