import { describe, expect, it } from 'vitest';

const loadSigningModule = async () => (
  await import('../../scripts/verify-release-signing.cjs') as {
    getSigningReadiness: (env: Record<string, string | undefined>) => {
      ok: boolean;
      mode: string | null;
      missing: string[];
    };
    buildWindowsPackageArgs: (env: Record<string, string | undefined>) => string[];
  }
);

describe('release signing preflight', () => {
  it('fails closed when no signing credentials are configured', async () => {
    const { getSigningReadiness } = await loadSigningModule();

    const readiness = getSigningReadiness({});

    expect(readiness.ok).toBe(false);
    expect(readiness.mode).toBeNull();
    expect(readiness.missing).toContain('WIN_CSC_LINK or CSC_LINK');
  });

  it('accepts electron-builder CSC/PFX credentials', async () => {
    const { getSigningReadiness, buildWindowsPackageArgs } = await loadSigningModule();
    const env = {
      WIN_CSC_LINK: 'base64-or-file-reference',
      WIN_CSC_KEY_PASSWORD: 'secret',
    };

    expect(getSigningReadiness(env)).toMatchObject({
      ok: true,
      mode: 'csc',
      missing: [],
    });
    expect(buildWindowsPackageArgs(env)).toEqual(['electron-builder', '--win']);
  });

  it('accepts Windows certificate store credentials and passes signtool options', async () => {
    const { getSigningReadiness, buildWindowsPackageArgs } = await loadSigningModule();
    const env = {
      WIN_CSC_SUBJECT_NAME: 'Vision Studio Team',
    };

    expect(getSigningReadiness(env)).toMatchObject({
      ok: true,
      mode: 'cert-store',
      missing: [],
    });
    expect(buildWindowsPackageArgs(env)).toContain(
      '-c.win.signtoolOptions.certificateSubjectName=Vision Studio Team'
    );
  });

  it('accepts Azure Trusted Signing credentials and passes Azure signing options', async () => {
    const { getSigningReadiness, buildWindowsPackageArgs } = await loadSigningModule();
    const env = {
      AZURE_TENANT_ID: 'tenant',
      AZURE_CLIENT_ID: 'client',
      AZURE_CLIENT_SECRET: 'secret',
      AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
      AZURE_TRUSTED_SIGNING_ACCOUNT_NAME: 'vision-studio-signing',
      AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME: 'public-release',
    };

    expect(getSigningReadiness(env)).toMatchObject({
      ok: true,
      mode: 'azure-trusted-signing',
      missing: [],
    });
    expect(buildWindowsPackageArgs(env)).toContain(
      '-c.win.azureSignOptions.endpoint=https://eus.codesigning.azure.net/'
    );
  });
});
