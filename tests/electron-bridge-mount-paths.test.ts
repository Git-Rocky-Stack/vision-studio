import { describe, expect, it } from 'vitest';

import {
  collectAppSources,
  findUnguardedMountPathBridgeCalls,
} from './support/mountPathBridgeCalls';

/**
 * A gate for the class of bug that made `settings` unmeasurable in the
 * performance suite.
 *
 * `src/types/electron.d.ts:509` declares `window.electron` as a required
 * property. It is required in the shipping app and absent everywhere else the
 * same bundle is loaded - `vite preview`, the dev server - so the compiler
 * cannot flag a call that assumes it. On an event handler that is harmless:
 * the handler only runs after a user clicked something in a window Electron
 * opened. On a *mount path* it is fatal, because the code runs before anything
 * could have noticed the bridge is missing, and the resulting
 * "Cannot read properties of undefined (reading 'settings')" takes the whole
 * panel down through its ErrorBoundary.
 *
 * That distinction was previously carried by an argument in a comment and by a
 * scan script that lived in a scratchpad directory. Neither stops a new
 * unguarded mount-path call from being added. This does.
 *
 * The classifier is deliberately conservative in the safe direction: it only
 * flags call sites it can show are reachable from a mount root by direct
 * calls, so it under-reports rather than demanding guards on handlers. The
 * fixtures below pin both directions, because a scanner that flags nothing is
 * indistinguishable from a passing repo.
 */
describe('mount-path bridge call classifier', () => {
  const scan = (text: string) => findUnguardedMountPathBridgeCalls([{ file: 'Fixture.tsx', text }]);

  it('flags an unguarded call in a useEffect callback', () => {
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          void window.electron.settings.get();
        }, []);
        return null;
      }
    `);

    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(4);
  });

  it('flags a call in a helper that the effect declares and then invokes', () => {
    // The shape that actually shipped in SettingsPanel: the access is two
    // scopes down from the effect, so any check that only looks at the
    // effect's own statements misses it.
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          const load = async () => {
            const s = await window.electron.settings.get();
            return s;
          };
          void load();
        }, []);
        return null;
      }
    `);

    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(5);
  });

  it('flags a call made directly in a component render body', () => {
    const found = scan(`
      export function Panel() {
        const version = window.electron.app.version;
        return version;
      }
    `);

    expect(found).toHaveLength(1);
  });

  it('flags a call at module top level', () => {
    const found = scan(`const bridge = window.electron.settings;`);

    expect(found).toHaveLength(1);
  });

  it('flags a call inside a custom hook body', () => {
    const found = scan(`
      export function useProvisioningStatus() {
        return window.electron.provisioning.status();
      }
    `);

    expect(found).toHaveLength(1);
  });

  it('does not flag an event handler', () => {
    const found = scan(`
      export function Panel() {
        return <button onClick={() => window.electron.dialog.open()} />;
      }
    `);

    expect(found).toEqual([]);
  });

  it('does not flag a useCallback body', () => {
    const found = scan(`
      export function Panel() {
        const onPick = useCallback(() => window.electron.dialog.open(), []);
        return <button onClick={onPick} />;
      }
    `);

    expect(found).toEqual([]);
  });

  it('does not flag a module-level helper that only handlers call', () => {
    // Reachability, not lexical position, is what decides. This helper sits at
    // module scope but nothing on a mount path calls it.
    const found = scan(`
      async function pickFile() {
        return window.electron.dialog.open();
      }

      export function Panel() {
        return <button onClick={() => void pickFile()} />;
      }
    `);

    expect(found).toEqual([]);
  });

  it('does not flag a listener the effect registers but never calls', () => {
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          const onDrop = () => void window.electron.assets.import();
          window.addEventListener('drop', onDrop);
          return () => window.removeEventListener('drop', onDrop);
        }, []);
        return null;
      }
    `);

    expect(found).toEqual([]);
  });

  it('does not flag an optional-chained access', () => {
    // `window.electron?.settings` cannot throw the error this gate exists for:
    // the whole point of the guard is that `window.electron` may be undefined.
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          if (!window.electron?.settings) return;
        }, []);
        return null;
      }
    `);

    expect(found).toEqual([]);
  });

  it('does not flag a bare dereference that an optional-chained guard precedes', () => {
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          if (!window.electron?.settings) return;
          void window.electron.settings.get();
        }, []);
        return null;
      }
    `);

    expect(found).toEqual([]);
  });

  it('flags a bare dereference that runs before its guard', () => {
    // Order is the whole difference between the previous fixture and a crash.
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          void window.electron.settings.get();
          if (!window.electron?.settings) return;
        }, []);
        return null;
      }
    `);

    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(4);
  });

  it('does not flag binding the bridge to a local without dereferencing it', () => {
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          const electron = window.electron;
          if (!electron?.settings) return;
          void electron.settings.get();
        }, []);
        return null;
      }
    `);

    expect(found).toEqual([]);
  });

  it('still flags a helper whose only guard sits in the calling effect', () => {
    // Pinned rather than incidental: a guard protects the call site it is
    // written in, and this helper is separately callable. Over-reporting here
    // is the intended direction - the fix is getElectronBridge() in the
    // helper, which is what the gate is steering toward.
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          if (!window.electron?.settings) return;
          void hydrate();
        }, []);
        return null;
      }

      async function hydrate() {
        return window.electron.settings.get();
      }
    `);

    expect(found).toHaveLength(1);
  });

  it('does not flag the guarded accessor', () => {
    const found = scan(`
      export function Panel() {
        useEffect(() => {
          const electron = getElectronBridge();
          if (!electron) return;
          void electron.settings.get();
        }, []);
        return null;
      }
    `);

    expect(found).toEqual([]);
  });
});

describe('src/ mount paths', () => {
  it('reaches the preload bridge only through getElectronBridge()', () => {
    const sources = collectAppSources();

    // A scanner pointed at nothing passes trivially. Prove it read the app.
    expect(sources.length).toBeGreaterThan(100);

    const unguarded = findUnguardedMountPathBridgeCalls(sources);
    const report = unguarded.map((site) => `${site.file}:${site.line} (${site.reason})`);

    expect(report).toEqual([]);
  });
});
