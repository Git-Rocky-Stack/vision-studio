import { describe, expectTypeOf, it } from 'vitest';
import type { ElectronAPI } from './preload';
import type { UserAccountsSnapshot } from './services/userAccounts';

// Type-level guard (checked by `npm run typecheck`): the bridge's account
// snapshot must be the service's own type, not a drifting hand-copy.
describe('preload account bridge types', () => {
  it('returns the userAccounts service snapshot, HuggingFace and video fields included', () => {
    type BridgeSnapshot = Awaited<ReturnType<ElectronAPI['accounts']['list']>>;
    expectTypeOf<BridgeSnapshot>().toEqualTypeOf<UserAccountsSnapshot>();
    expectTypeOf<
      BridgeSnapshot['accounts'][number]['preferences']['promptEnhancementProvider']
    >().toEqualTypeOf<'local' | 'openrouter' | 'huggingface'>();
    expectTypeOf<BridgeSnapshot['accounts'][number]['preferences']>().toHaveProperty('huggingFaceVideoModel');
  });
});
