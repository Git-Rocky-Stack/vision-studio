import { describe, expect, it } from 'vitest';

import type { AssetRecord } from '@/types/assets';

import { indexAssetsById } from './assetIndex';

const asset = (id: string) => ({ id, name: `${id}.png` }) as AssetRecord;

describe('indexAssetsById', () => {
  it('indexes a library snapshot by id', () => {
    const index = indexAssetsById([asset('a'), asset('b')]);
    expect(index.get('b')?.name).toBe('b.png');
    expect(index.size).toBe(2);
  });

  it('builds one shared index per snapshot, and a fresh one for a new snapshot', () => {
    const library = [asset('a')];
    expect(indexAssetsById(library)).toBe(indexAssetsById(library));
    expect(indexAssetsById([...library])).not.toBe(indexAssetsById(library));
  });
});
