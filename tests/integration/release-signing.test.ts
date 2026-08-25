import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

// Shape comes from scripts/verify-release-signing.d.cts. It used to be restated
// as an inline cast here, which meant two hand-maintained copies of the same
// claim that could disagree with each other and with the .cjs.
const loadSigningModule = async () => await import('../../scripts/verify-release-signing.cjs');

const AZURE_ENV = {
  AZURE_TENANT_ID: 'tenant',
  AZURE_CLIENT_ID: 'client',
  AZURE_CLIENT_SECRET: 'secret',
  AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
  AZURE_TRUSTED_SIGNING_ACCOUNT_NAME: 'vision-studio-signing',
  AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME: 'public-release',
};

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
    const env = AZURE_ENV;

    expect(getSigningReadiness(env)).toMatchObject({
      ok: true,
      mode: 'azure-trusted-signing',
      missing: [],
    });
    expect(buildWindowsPackageArgs(env)).toContain(
      '-c.win.azureSignOptions.endpoint=https://eus.codesigning.azure.net/'
    );
  });

  it('carries the publisher name into the Azure signing block', async () => {
    // app-builder-lib reads the publisher name from the ACTIVE signing
    // manager, and `azureSignOptions` takes precedence over the
    // `signtoolOptions.publisherName` declared in electron-builder.yml. Without
    // this the Azure path resolves no publisher name and
    // verifyUpdateCodeSignature falls back to whatever subject the certificate
    // happens to carry.
    const { buildWindowsPackageArgs } = await loadSigningModule();

    expect(buildWindowsPackageArgs(AZURE_ENV)).toContain(
      '-c.win.azureSignOptions.publisherName=Vision Studio Team'
    );
  });

  it('reads the publisher name from electron-builder.yml rather than hardcoding it', async () => {
    // One source of truth: the name the installer is stamped with and the name
    // the updater verifies against must not be able to drift apart.
    const { buildWindowsPackageArgs } = await loadSigningModule();
    const config = parse(readFileSync(resolve(__dirname, '../../electron-builder.yml'), 'utf8'));

    expect(buildWindowsPackageArgs(AZURE_ENV)).toContain(
      `-c.win.azureSignOptions.publisherName=${config.win.signtoolOptions.publisherName}`
    );
  });
});
