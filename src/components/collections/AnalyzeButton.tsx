import { memo, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';

interface AnalyzeButtonProps {
  className?: string;
}

/**
 * Drains the tagging backlog on demand. The count is derived from the library
 * itself rather than from the queue, so the control is honest whichever tagging
 * mode is active: it offers exactly the work that is actually outstanding, and
 * disables itself - with the reason - when there is none.
 */
export const AnalyzeButton = memo(function AnalyzeButton({ className }: AnalyzeButtonProps) {
  const { assetLibrary, assetMetadata, taggingMode, analyzeUntaggedAssets } = useAppStore(
    useShallow((s) => ({
      assetLibrary: s.assetLibrary,
      assetMetadata: s.assetMetadata,
      taggingMode: s.taggingMode,
      analyzeUntaggedAssets: s.analyzeUntaggedAssets,
    })),
  );

  const untaggedCount = useMemo(
    () => assetLibrary.reduce((n, asset) => (assetMetadata.has(asset.id) ? n : n + 1), 0),
    [assetLibrary, assetMetadata],
  );

  const taggingOff = taggingMode === 'off';
  const disabled = taggingOff || untaggedCount === 0;

  const label = taggingOff
    ? 'Tagging off'
    : untaggedCount === 0
      ? 'All assets tagged'
      : `Analyze ${untaggedCount} untagged`;

  const title = taggingOff
    ? 'Asset tagging is switched off in Settings.'
    : untaggedCount === 0
      ? 'Every asset in the library has been analyzed.'
      : `Derive tags for ${untaggedCount} ${untaggedCount === 1 ? 'asset' : 'assets'}.`;

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={Sparkles}
      className={className}
      title={title}
      onClick={analyzeUntaggedAssets}
      disabled={disabled}
    >
      {label}
    </Button>
  );
});
