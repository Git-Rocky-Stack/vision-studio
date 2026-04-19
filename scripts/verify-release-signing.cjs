#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const CSC_LINK_KEYS = ['WIN_CSC_LINK', 'CSC_LINK'];
const CSC_PASSWORD_KEYS = ['WIN_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'];
const CERT_SUBJECT_KEYS = ['WIN_CSC_SUBJECT_NAME', 'WINDOWS_CERTIFICATE_SUBJECT_NAME'];
const CERT_SHA1_KEYS = ['WIN_CSC_SHA1', 'WINDOWS_CERTIFICATE_SHA1'];
const AZURE_AUTH_SECRET_KEYS = [
  'AZURE_CLIENT_SECRET',
  'AZURE_CLIENT_CERTIFICATE_PATH',
  'AZURE_USERNAME',
];
const AZURE_REQUIRED_KEYS = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_TRUSTED_SIGNING_ENDPOINT',
  'AZURE_TRUSTED_SIGNING_ACCOUNT_NAME',
  'AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME',
];

function hasAny(env, keys) {
  return keys.some((key) => Boolean(env[key]));
}

function firstValue(env, keys) {
  const key = keys.find((candidate) => Boolean(env[candidate]));
  return key ? env[key] : undefined;
}

function getSigningReadiness(env = process.env) {
  if (hasAny(env, CSC_LINK_KEYS)) {
    const missing = hasAny(env, CSC_PASSWORD_KEYS) ? [] : ['WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD'];
    return {
      ok: missing.length === 0,
      mode: missing.length === 0 ? 'csc' : null,
      missing,
    };
  }

  if (hasAny(env, CERT_SUBJECT_KEYS) || hasAny(env, CERT_SHA1_KEYS)) {
    return {
      ok: true,
      mode: 'cert-store',
      missing: [],
    };
  }

  const missingAzure = AZURE_REQUIRED_KEYS.filter((key) => !env[key]);
  if (!hasAny(env, AZURE_AUTH_SECRET_KEYS)) {
    missingAzure.push('AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH or AZURE_USERNAME/AZURE_PASSWORD');
  }

  if (missingAzure.length === 0) {
    return {
      ok: true,
      mode: 'azure-trusted-signing',
      missing: [],
    };
  }

  return {
    ok: false,
    mode: null,
    missing: [
      'WIN_CSC_LINK or CSC_LINK',
      ...missingAzure,
    ],
  };
}

function buildWindowsPackageArgs(env = process.env) {
  const readiness = getSigningReadiness(env);

  if (!readiness.ok) {
    throw new Error(`Release signing is not configured. Missing: ${readiness.missing.join(', ')}`);
  }

  const args = ['electron-builder', '--win'];

  if (readiness.mode === 'cert-store') {
    const subjectName = firstValue(env, CERT_SUBJECT_KEYS);
    const sha1 = firstValue(env, CERT_SHA1_KEYS);
    if (subjectName) {
      args.push(`-c.win.signtoolOptions.certificateSubjectName=${subjectName}`);
    }
    if (sha1) {
      args.push(`-c.win.signtoolOptions.certificateSha1=${sha1}`);
    }
  }

  if (readiness.mode === 'azure-trusted-signing') {
    args.push(
      `-c.win.azureSignOptions.endpoint=${env.AZURE_TRUSTED_SIGNING_ENDPOINT}`,
      `-c.win.azureSignOptions.codeSigningAccountName=${env.AZURE_TRUSTED_SIGNING_ACCOUNT_NAME}`,
      `-c.win.azureSignOptions.certificateProfileName=${env.AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME}`
    );
  }

  return args;
}

function printReadiness(readiness) {
  if (readiness.ok) {
    console.log(`Release signing preflight passed (${readiness.mode}).`);
    return;
  }

  console.error('Release signing preflight failed.');
  console.error('Configure one of:');
  console.error('  - WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD for electron-builder CSC/PFX signing');
  console.error('  - WIN_CSC_SUBJECT_NAME or WIN_CSC_SHA1 for a Windows certificate-store token');
  console.error('  - Azure Trusted Signing environment variables');
  console.error(`Missing: ${readiness.missing.join(', ')}`);
}

function runPackage() {
  const args = buildWindowsPackageArgs(process.env);
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  if (process.argv.includes('--package-win')) {
    runPackage();
  }

  const readiness = getSigningReadiness(process.env);
  printReadiness(readiness);
  process.exit(readiness.ok ? 0 : 1);
}

module.exports = {
  buildWindowsPackageArgs,
  getSigningReadiness,
};
