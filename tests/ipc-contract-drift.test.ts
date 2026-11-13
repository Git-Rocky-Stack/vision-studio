import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ImageGenerationRequestPayload, LoraSelectionPayload } from '@/types/generation';
import type { ProvisionStatus } from '@/types/model';
import type { ElectronAPI, JobStatus, StepImageEvent } from '@/types/electron';
import {
  IPC_BRIDGE,
  IPC_CONTRACT,
  IPC_PUSH_BRIDGE,
  IPC_PUSH_SCHEMAS,
  type ImageGenerationRequest,
  type IpcArgs,
  type IpcResult,
  type VideoGenerationRequest,
} from '../shared/ipcContract';
import type { ProvisionStatusSnapshot } from '../shared/ipcTypes';

/**
 * One contract, no drift (S5): the renderer's request types, the contract's
 * schemas, the preload bridge and the main-process registrations must agree.
 * The type assertions are checked by `npm run typecheck` (tsconfig.tests.json).
 */

const repoRoot = path.resolve(__dirname, '..');

describe('IPC contract drift', () => {
  it('types the renderer image payload exactly as the contract does', () => {
    expectTypeOf<ImageGenerationRequestPayload>().toMatchTypeOf<ImageGenerationRequest>();
    expectTypeOf<ImageGenerationRequest>().toMatchTypeOf<ImageGenerationRequestPayload>();
    expectTypeOf<ImageGenerationRequest['__providerOverride']>().toEqualTypeOf<'openrouter' | 'huggingface' | undefined>();
    expectTypeOf<ImageGenerationRequest['__huggingFaceLoraAdapter']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NonNullable<ImageGenerationRequest['loras']>[number]>().toMatchTypeOf<LoraSelectionPayload>();
  });

  it('carries the video route fields the handler reads', () => {
    expectTypeOf<VideoGenerationRequest>().toHaveProperty('acceleration_settings');
    expectTypeOf<VideoGenerationRequest>().toHaveProperty('loras');
    expectTypeOf<VideoGenerationRequest['__providerOverride']>().toEqualTypeOf<'huggingface' | undefined>();
  });

  it('declares hosted sources and fallback on prompt-assist results', () => {
    type Suggest = IpcResult<'generation:suggest-negative-prompt'>;
    expectTypeOf<Suggest['source']>().toEqualTypeOf<'openrouter' | 'huggingface' | 'heuristic' | undefined>();
    expectTypeOf<Suggest['fallback']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<IpcResult<'generation:enhance-prompt'>['fallback']>().toEqualTypeOf<boolean | undefined>();
  });

  it('types run-graph as an envelope and backend pid as nullable', () => {
    type RunGraph = IpcResult<'workflow:run-graph'>;
    expectTypeOf<Extract<RunGraph, { success: false }>['error']>().toEqualTypeOf<string>();
    expectTypeOf<IpcResult<'backend:status'>['pid']>().toEqualTypeOf<number | null>();
  });

  it('keeps provisioning snapshots assignable to the renderer type, with tier and size (K3)', () => {
    expectTypeOf<ProvisionStatusSnapshot>().toMatchTypeOf<ProvisionStatus>();
    expectTypeOf<ProvisionStatusSnapshot['models'][number]['tier']>().toEqualTypeOf<'core' | 'extended' | undefined>();
    expectTypeOf<ProvisionStatusSnapshot['models'][number]['size_bytes']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<NonNullable<IpcResult<'system:get-info'>['availability']>['tensorrt']>().toEqualTypeOf<
      { available: boolean; reason?: string } | undefined
    >();
    expectTypeOf<IpcArgs<'provision:start'>>().toEqualTypeOf<[({ modelIds?: string[] | undefined } | undefined)?]>();
  });

  it('types push payloads (no any) on window.electron', () => {
    type ProgressCallback = Parameters<ElectronAPI['generation']['onProgress']>[0];
    expectTypeOf<Parameters<ProgressCallback>[0]['status']>().toEqualTypeOf<JobStatus['status']>();
    expectTypeOf<Parameters<Parameters<ElectronAPI['generation']['onStepImage']>[0]>[0]>().toEqualTypeOf<StepImageEvent>();
    type StatusCallback = Parameters<ElectronAPI['backend']['onStatusChange']>[0];
    expectTypeOf<Parameters<StatusCallback>[0]['error']>().toEqualTypeOf<string | undefined>();
  });

  it('exposes every contract channel through the bridge, and nothing else', () => {
    const bridged = Object.values(IPC_BRIDGE).flatMap((methods) => Object.values(methods));
    expect(new Set(bridged).size).toBe(bridged.length);
    expect([...bridged].sort()).toEqual(Object.keys(IPC_CONTRACT).sort());
    const pushed = Object.values(IPC_PUSH_BRIDGE).flatMap((methods) => Object.values(methods));
    expect([...pushed].sort()).toEqual(Object.keys(IPC_PUSH_SCHEMAS).sort());
  });

  it('registers a main-process handler for every contract channel, exactly once', () => {
    const sources = [
      'electron/services/mainIpc.ts',
      'electron/ipc-handlers/generation.ts',
      'electron/services/downloadTokens.ts',
    ].map((file) => readFileSync(path.join(repoRoot, file), 'utf8'));
    const registered = sources.flatMap((source) =>
      // `on('x'` (the module helpers) or `handleIpc(ipcMain, 'x'`; never `socket.on(` / `app.on(`.
      [...source.matchAll(/(?:(?<![.\w])on\(|handleIpc\(ipcMain,\s*)'([^']+)'/g)].map((match) => match[1]),
    );
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual(Object.keys(IPC_CONTRACT).sort());
  });

  it('subscribes to the renamed backend status push channel (K6)', () => {
    expect(IPC_PUSH_BRIDGE.backend.onStatusChange).toBe('backend:status-changed');
    expect(Object.keys(IPC_CONTRACT)).toContain('backend:status');
  });
});
