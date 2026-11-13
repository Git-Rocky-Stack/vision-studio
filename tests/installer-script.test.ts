import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(path.resolve(process.cwd(), 'build/installer.nsh'), 'utf8');
const code = script
  .split(/\r?\n/)
  .map((line) => line.replace(/;.*$/, '').trim())
  .filter(Boolean);

function macroBody(name: string): string[] {
  const start = code.indexOf(`!macro ${name}`);
  expect(start, `macro ${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = code.indexOf('!macroend', start);
  return code.slice(start + 1, end);
}

describe('build/installer.nsh (electron-builder include)', () => {
  it('stays macro-only, as electron-builder includes it', () => {
    for (const line of code) {
      expect(line).not.toMatch(/^(Name|OutFile|VIProductVersion|VIAddVersionKey|Section|Function)\b/);
    }
    const opened = code.filter((line) => line.startsWith('!macro ')).length;
    const closed = code.filter((line) => line === '!macroend').length;
    expect(opened).toBe(closed);
  });

  it('has no empty placeholder macros', () => {
    for (const line of code.filter((entry) => entry.startsWith('!macro '))) {
      const name = line.slice('!macro '.length).split(/\s+/)[0];
      expect(macroBody(name).length, `${name} has a body`).toBeGreaterThan(0);
    }
    expect(script).not.toMatch(/Reserved for future/i);
  });

  it('stops the app and any orphaned backend before install, update and uninstall', () => {
    expect(macroBody('customInit')).toEqual(['!insertmacro VisionStudioStopRunningProcesses']);
    expect(macroBody('customUnInit')).toEqual(['!insertmacro VisionStudioStopRunningProcesses']);

    const stop = macroBody('VisionStudioStopRunningProcesses').join('\n');
    const appKill = stop.indexOf('/F /T /IM "${APP_EXECUTABLE_FILENAME}"');
    const backendKill = stop.indexOf('/F /T /IM "VisionStudio-Backend.exe"');
    expect(appKill).toBeGreaterThan(-1);
    expect(backendKill).toBeGreaterThan(-1);
    // The app goes first: alive, it would restart a backend killed under it.
    expect(appKill).toBeLessThan(backendKill);
    expect(stop).toMatch(/nsExec::Exec `"\$SYSDIR\\taskkill\.exe"/);
  });

  it('keeps the NSIS stack balanced (every nsExec result is popped, $0 is restored)', () => {
    const stop = macroBody('VisionStudioStopRunningProcesses');
    const execs = stop.filter((line) => line.startsWith('nsExec::Exec')).length;
    const pushes = stop.filter((line) => line.startsWith('Push ')).length;
    const pops = stop.filter((line) => line.startsWith('Pop ')).length;
    // One pop per exec result, and every pushed register restored on both
    // exits (the Quit path and the normal end).
    expect(pops).toBe(execs + pushes * 2);
  });

  it('gives a quitting app a bounded chance to stop its backend before an update kills it', () => {
    const stop = macroBody('VisionStudioStopRunningProcesses').join('\n');
    const wait = stop.indexOf('${If} ${isUpdated}');
    expect(wait).toBeGreaterThan(-1);
    expect(stop).toMatch(/\$\{LoopUntil\} \$1 >= 20/);
    expect(wait).toBeLessThan(stop.indexOf('/F /T /IM "${APP_EXECUTABLE_FILENAME}"'));
  });

  it('asks before closing a running app on interactive runs only', () => {
    const stop = macroBody('VisionStudioStopRunningProcesses').join('\n');
    expect(stop).toMatch(/\$\{IfNot\} \$\{Silent\}\n\$\{AndIfNot\} \$\{isUpdated\}/);
    expect(stop).toMatch(/MessageBox MB_OKCANCEL\|MB_ICONEXCLAMATION "\$\(appRunning\)" \/SD IDOK/);
  });
});
