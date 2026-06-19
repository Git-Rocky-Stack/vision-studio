/** Coarse, best-effort map from a model id to a curated-KB family key (M7 S6). Null → KB falls back to generic. */
export function inferModelFamily(modelName: string | undefined): string | null {
  if (!modelName) return null;
  const name = modelName.toLowerCase();
  if (name.includes('flux')) return 'flux';
  if (name.includes('video') || name.includes('svd') || name.includes('ltx') || name.includes('wan')) return 'video';
  if (name.includes('xl')) return 'sdxl';
  if (name.includes('v1-5') || name.includes('1.5') || name.includes('sd15')) return 'sd15';
  return null;
}
