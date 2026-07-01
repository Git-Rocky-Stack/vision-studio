import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type TokenSetter = (token: string) => Promise<{ success: boolean }>;

/**
 * One provider's write-only token field. The token is sent to the main process
 * and stored in the OS credential vault; it is never read back, so the field
 * clears on a successful save and shows a transient "Saved" confirmation rather
 * than echoing the value.
 */
function TokenRow({
  provider,
  placeholder,
  onSave,
}: {
  provider: string;
  placeholder: string;
  onSave: TokenSetter | undefined;
}) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!token.trim() || !onSave) return;
    setSaving(true);
    setSaved(false);
    try {
      const result = await onSave(token);
      if (result?.success) {
        setSaved(true);
        setToken('');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Input
          label={`${provider} token`}
          type="password"
          autoComplete="off"
          value={token}
          placeholder={placeholder}
          onChange={(event) => {
            setToken(event.target.value);
            setSaved(false);
          }}
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        aria-label={`Save ${provider}`}
        isLoading={saving}
        onClick={save}
      >
        Save
      </Button>
      {saved && (
        <span className="inline-flex items-center gap-1 pb-2 text-xs text-status-success">
          <Check aria-hidden="true" className="h-3.5 w-3.5" /> Saved
        </span>
      )}
    </div>
  );
}

/**
 * Hugging Face + CivitAI access tokens for gated/rate-limited hub access.
 * Tokens are write-only: stored in the OS credential vault via the auth IPC and
 * never surfaced back to the renderer.
 */
export function ModelTokensBar() {
  const auth = window.electron?.auth;
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Add access tokens for gated or rate-limited downloads. Tokens are stored securely and
        cannot be read back.
      </p>
      <TokenRow
        provider="Hugging Face"
        placeholder="hf_..."
        onSave={auth?.setHfToken}
      />
      <TokenRow provider="CivitAI" placeholder="CivitAI API key" onSave={auth?.setCivitaiToken} />
    </div>
  );
}
