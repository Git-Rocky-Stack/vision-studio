# Code Signing for Vision Studio (Windows)

This document covers the complete process for code signing the Vision Studio Electron desktop application on Windows: choosing a signing identity (Azure Artifact Signing, an OV certificate, or an EV certificate), where the private key lives, and how the release pipeline enforces signing.

> **Status:** Windows signing is configured through **Azure Artifact Signing**, and 3.5.0 is the first signed release. Published releases up to v3.4.1 are unsigned. Because `win.verifyUpdateCodeSignature` is on, a 3.4.x install refuses every update, signed or not (its `app-update.yml` names the old `Vision Studio Team` publisher), so 3.4.x users move to 3.5.0 by downloading the installer once. macOS builds are not yet notarized.
>
> | Setting | Value |
> |---------|-------|
> | Subscription / resource group | `Azure subscription 1` / `artifact_code_signing` |
> | Artifact Signing account | `Strategia-X` (Basic, East US), endpoint `https://eus.codesigning.azure.net/` |
> | Certificate profile | `Strategia-X` (Public Trust); certificates are short-lived and rotate daily |
> | Certificate subject / `publisherName` | `CN=Sharif Elsalaymeh` (individual identity validation) / `Sharif Elsalaymeh` |
> | CI identity | Entra app + service principal `vision-studio-release-signing`, role **Artifact Signing Certificate Profile Signer** on that one profile only |
> | Client secret | Stored only as the `AZURE_CLIENT_SECRET` repository secret; expires **2027-11-13**. Rotate before then with `az ad sp credential reset --id <AZURE_CLIENT_ID> --years 1 --query password -o tsv \| gh secret set AZURE_CLIENT_SECRET` |

## Table of Contents

1. [Choosing a Signing Identity](#choosing-a-signing-identity)
2. [Certificate Providers](#certificate-providers)
3. [Hardware Token vs Cloud HSM](#hardware-token-vs-cloud-hsm)
4. [Installation Steps](#installation-steps)
5. [Signing Process](#signing-process)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## Choosing a Signing Identity

### What signing does and does not buy

Signing gives every installer a verified publisher name, lets SmartScreen attach reputation to that publisher rather than to each file hash alone, and is a hard requirement for the in-app updater (`verifyUpdateCodeSignature`). It does **not** buy an instant SmartScreen pass, whatever the certificate type:

- **EV certificates no longer bypass SmartScreen.** Microsoft removed that behavior in 2024: EV-signed files "now go through the same reputation-building process as OV certificates", and paying the EV premium "solely to avoid SmartScreen warnings is **no longer justified**" ([Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)).
- **Reputation accumulates.** SmartScreen weighs publisher reputation and file-hash reputation. A newly signed binary can still show the "unrecognized app" prompt (with the verified publisher name) until it has enough clean download history, which "can take several weeks and hundreds of clean installs from a wide audience" ([SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
- **Keep one signing identity.** Reputation carries across releases only when they are signed with the same publisher identity; changing the certificate affects the publisher signal (same source).

### Options compared

| Option | Approx. cost | Availability | SmartScreen | Fit for Vision Studio |
|--------|--------------|--------------|-------------|-----------------------|
| **Azure Artifact Signing** (formerly Trusted Signing) | ~$9.99/month | Organizations: USA, Canada, EU, UK. Individuals: USA and Canada | Reputation builds over time | Recommended: no hardware token, signs in CI, supported by `npm run package:win:signed` |
| **OV certificate** (DigiCert, Sectigo, GlobalSign) | $150-300/year | Worldwide | Same as Artifact Signing | Use when Artifact Signing is unavailable in your region; the key must live on an HSM or token |
| **EV certificate** | $400+/year | Worldwide | Same as OV since 2024 | Only if enterprise procurement asks for EV; no SmartScreen advantage |

Cost, availability and SmartScreen columns are Microsoft's, from [Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options). Since June 2023 the CA/Browser Forum requires OV keys, like EV keys, to be stored on an HSM or hardware token (same source), so the hardware sections below apply to both.

### Requirements Summary

| Requirement | Description |
|-------------|-------------|
| **Identity Verification** | Microsoft (Artifact Signing) or the CA (OV/EV) validates the organization or individual before issuing |
| **Key Storage** | Managed by the service (Artifact Signing), or a SafeNet eToken 5110 / cloud HSM (Azure Key Vault, AWS CloudHSM) for OV/EV |
| **Certificate Validity** | 1-3 years (renewable) |
| **SHA-256 Signing** | Mandatory for all Windows executables |
| **RFC 3161 Timestamp** | Required for signature persistence |

---

## Certificate Providers

### Traditional Certificate Authorities (OV / EV)

The prices below are each CA's EV tier; every CA also sells a cheaper OV tier. With SmartScreen treating OV and EV alike, buy EV only when a customer requires it. Azure Artifact Signing needs no CA purchase at all (see [Choosing a Signing Identity](#choosing-a-signing-identity)).

#### 1. DigiCert EV Code Signing
- **Price**: ~$599/year
- **Validation Time**: 1-5 business days
- **Hardware**: SafeNet eToken 5110 FIPS
- **Cloud Option**: DigiCert Secure Software Manager
- **Website**: [DigiCert EV Code Signing](https://www.digicert.com/code-signing/ev-code-signing.htm)

#### 2. Sectigo (formerly Comodo) EV
- **Price**: ~$449/year
- **Validation Time**: 1-3 business days
- **Hardware**: SafeNet eToken 5110
- **Cloud Option**: Sectigo Certificate Manager
- **Website**: [Sectigo EV](https://sectigo.com/product-details/ev-code-signing)

#### 3. GlobalSign EV
- **Price**: ~$549/year
- **Validation Time**: 2-5 business days
- **Hardware**: SafeNet eToken 5110 FIPS
- **Cloud Option**: GlobalSign HSM
- **Website**: [GlobalSign EV](https://www.globalsign.com/en-us/code-signing/ev-code-signing)

---

## Hardware Token vs Cloud HSM

### Option 1: Hardware Token (SafeNet eToken 5110)

**Pros:**
- One-time hardware cost (often included with certificate)
- Full control over private key
- No ongoing cloud costs
- Works offline

**Cons:**
- Physical token can be lost/damaged
- Requires Windows driver installation
- Not ideal for CI/CD automation
- Single point of failure

**Installation Steps:**

1. **Install SafeNet Drivers**
   ```powershell
   # Download from Gemalto/Thales website
   # Install SafeNet Authentication Client
   ```

2. **Insert Hardware Token**
   - Plug in the USB token
   - Verify detection in Device Manager

3. **Import Certificate**
   ```powershell
   # Certificate usually auto-imported
   # Verify in certmgr.msc > Personal > Certificates
   ```

### Option 2: Cloud HSM (Recommended for CI/CD)

#### Azure Key Vault HSM

**Pros:**
- Fully automated signing in CI/CD
- No physical hardware to manage
- High availability
- Audit logging built-in

**Cons:**
- Ongoing monthly costs (~$10-50/month)
- Requires Azure subscription
- Network dependency

**Setup Steps:**

1. **Create Azure Key Vault Premium** (HSM-enabled)
   ```powershell
   az keyvault create `
     --name "VisionStudioHSM" `
     --resource-group "VisionStudio" `
     --location "eastus" `
     --sku "Premium"
   ```

2. **Import Certificate to HSM**
   ```powershell
   az keyvault certificate import `
     --vault-name "VisionStudioHSM" `
     --name "VisionStudioEV" `
     --file "certificate.pfx"
   ```

3. **Configure Service Principal**
   ```powershell
   az ad sp create-for-rbac `
     --name "VisionStudioSigner" `
     --role "Key Vault Certificate User"
   ```

#### AWS HSM (CloudHSM)

**Pros:**
- AWS-native integration
- FIPS 140-2 Level 3 validated
- Dedicated HSM instance

**Cons:**
- Higher cost (~$1,400/month minimum)
- More complex setup
- AWS region dependency

---

## Installation Steps

### Step 1: Obtain a Certificate (OV / EV)

Skip to [electron-builder Integration](#electron-builder-integration) if you use Azure Artifact Signing: Microsoft validates your identity and holds the keys, so there is no CSR, token or `signtool` install.

1. **Generate CSR (Certificate Signing Request)**
   ```powershell
   # If using hardware token, this is done during enrollment
   # For cloud HSM, CA generates in their HSM
   ```

2. **Complete Business Verification**
   - Provide business registration documents
   - Verify business phone number (CA will call)
   - Complete domain ownership verification

3. **Receive Certificate**
   - Hardware token: Shipped via secure courier
   - Cloud HSM: Certificate loaded in CA's HSM

### Step 2: Install Windows SDK

Download and install the **Windows SDK** which includes `signtool.exe`:

1. Download from: [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/)
2. During installation, select "Windows SDK Signing Tools for Desktop Apps"
3. Verify installation:
   ```powershell
   signtool.exe /?
   ```

### Step 3: Install Azure Sign Tool (Optional)

For Azure Key Vault integration, install AzureSignTool:

```powershell
dotnet tool install --global AzureSignTool
```

---

## Signing Process

### Manual Signing (Hardware Token)

1. **Insert hardware token** into USB port
2. **Run signing script**:
   ```powershell
   .\scripts\code-sign.ps1 -FilePath "release\nsis-web\Vision-Studio-<version>-Setup.exe"
   ```

3. **Verify signature**:
   ```powershell
   signtool.exe verify /pa "release\nsis-web\Vision-Studio-<version>-Setup.exe"
   ```

The installer name comes from `nsisWeb.artifactName` in `electron-builder.yml` (`Vision-Studio-${version}-Setup.${ext}`), for example `Vision-Studio-3.5.0-Setup.exe`. Release builds are not signed by hand: `npm run package:win:signed` signs during packaging (see [electron-builder Integration](#electron-builder-integration)). The manual path is for re-signing or verifying a single file.

### Automated Signing (Azure Key Vault)

1. **Configure environment variables**:
   ```powershell
   $env:AZURE_TENANT_ID = "your-tenant-id"
   $env:AZURE_CLIENT_ID = "your-client-id"
   $env:AZURE_CLIENT_SECRET = "your-client-secret"
   ```

2. **Run signing with Azure**:
   ```powershell
   .\scripts\code-sign.ps1 `
     -FilePath "release\nsis-web\Vision-Studio-<version>-Setup.exe" `
     -UseAzureKeyVault `
     -AzureKeyVaultUrl "https://visionstudiohsm.vault.azure.net/" `
     -AzureCertificateName "VisionStudioEV"
   ```

### electron-builder Integration

Production Windows releases are gated by `scripts/verify-release-signing.cjs`.
The release workflow runs `npm run release:signing:check` before packaging and
then packages with `npm run package:win:signed`. If no supported signing
configuration is present, the build fails before any artifact can be uploaded.

Supported release signing modes:

| Mode | Required environment |
|------|----------------------|
| electron-builder CSC/PFX | `WIN_CSC_LINK` or `CSC_LINK`, plus `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD` |
| Windows certificate store / hardware token | `WIN_CSC_SUBJECT_NAME` or `WIN_CSC_SHA1` (also accepted: `WINDOWS_CERTIFICATE_SUBJECT_NAME`, `WINDOWS_CERTIFICATE_SHA1`) |
| Azure Artifact Signing (formerly Trusted Signing) | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, one Azure auth method (`AZURE_CLIENT_SECRET`, `AZURE_CLIENT_CERTIFICATE_PATH`, or `AZURE_USERNAME` + `AZURE_PASSWORD`), plus `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, and `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME` |

Local verification:

```powershell
npm run release:signing:check
npm run build
npm run package:win:signed
```

For Azure Artifact Signing, `scripts/verify-release-signing.cjs --package-win`
passes `win.azureSignOptions.endpoint`, `codeSigningAccountName`,
`certificateProfileName` and `publisherName` to electron-builder as `-c.`
overrides at runtime, so `azureSignOptions` is never declared in
`electron-builder.yml` and local unsigned packaging with `npm run package:win`
remains available for development builds. `publisherName` is read from
`win.signtoolOptions.publisherName` in `electron-builder.yml` (`Sharif
Elsalaymeh`): electron-builder's Azure signing manager ignores `signtoolOptions`
entirely, and electron-updater verifies updates against this name, so the script
mirrors it to keep one source of truth. It must match the certificate subject.

electron-builder then installs the `TrustedSigning` PowerShell module and calls
`Invoke-TrustedSigning`, which authenticates with the Azure environment-credential
variables in the table and timestamps against `http://timestamp.acs.microsoft.com`
by default. The environment variable names keep the service's former "Trusted
Signing" name; Microsoft has since renamed it
[Artifact Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/).

---

## CI/CD Integration

Production releases are built by `.github/workflows/release.yml` (triggered by a
`v*` tag, or manually) on `windows-latest`. A manual run (`gh workflow run release.yml`)
builds, signs and uploads the installer as an Actions artifact without publishing
anything: the R2 update feed and the GitHub Release are written only for a `v*`
tag. The `build-windows` job:

1. Runs the signing **preflight** - `npm run release:signing:check` - which fails
   the build if no supported signing configuration is present, so no *unsigned*
   production artifact can ever be produced or uploaded.
2. Packages with `npm run package:win:signed`, which re-checks readiness and
   passes the mode-specific options to electron-builder at runtime.

Both steps receive the signing secrets via `env:` (see the workflow). The
preflight (`scripts/verify-release-signing.cjs`) selects the first configured
mode in this order: **CSC/PFX -> Windows cert-store/token -> Azure Artifact
Signing**, matching the modes table in [Signing Process](#signing-process).

### Required GitHub repository secrets

Configure the secrets for **exactly one** mode (repo Settings -> Secrets and
variables -> Actions). The workflow references all of them, but only one complete
set must be present for the preflight to pass.

| Mode | Secrets |
|------|---------|
| **CSC / PFX** | `WIN_CSC_LINK` (or `CSC_LINK`) - base64 or URL of the `.pfx`; plus `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`) |
| **Windows cert-store / hardware token** | `WIN_CSC_SUBJECT_NAME` (or `WIN_CSC_SHA1`) - selects an installed certificate by subject name or SHA-1 thumbprint |
| **Azure Artifact Signing** (recommended for CI) | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus one auth secret: `AZURE_CLIENT_SECRET`, `AZURE_CLIENT_CERTIFICATE_PATH`, or `AZURE_USERNAME` + `AZURE_PASSWORD` |

The Azure Artifact Signing set is configured (see the status table at the top).
If it is ever removed, the signed `build-windows` job fails fast at the
preflight, by design.

### Development (unsigned) vs production (signed)

| | Command | Signing | Use |
|---|---------|---------|-----|
| **Dev / local** | `npm run package:win` | none (unsigned) | Fast local installers for testing. SmartScreen will warn - expected for unsigned builds. |
| **Production** | `npm run package:win:signed` (or the release workflow) | required - preflight-gated | Distributable signed builds. Fails fast if signing is not configured. |

`npm run package:win` deliberately stays available with no credentials so
contributors can produce local builds; only the `:signed` path and the release
workflow enforce signing. Never distribute the unsigned dev output.

---

## Troubleshooting

### Common Issues

#### 1. "No certificate found" Error

**Symptoms:**
```
[<timestamp>] [WARNING] WARNING: No EV certificate found matching 'Sharif Elsalaymeh'
```

**Solutions:**
- Verify certificate is installed: `certmgr.msc` > Personal > Certificates
- Check certificate has Code Signing EKU: `1.3.6.1.5.5.7.3.3`
- Ensure hardware token drivers are installed
- Try running as Administrator

#### 2. "signtool.exe not found" Error

**Symptoms:**
```
[ERROR] signtool.exe not found. Install Windows SDK.
```

**Solutions:**
- Install Windows SDK from Microsoft
- Add SDK path to PATH environment variable:
  ```powershell
  $env:PATH += ";C:\Program Files (x86)\Windows Kits\10\bin\x64"
  ```

#### 3. SmartScreen Still Shows Warning

**Symptoms:**
- Signed but SmartScreen shows "Unknown Publisher"

A signed build that shows the "unrecognized app" prompt *with* the publisher
name is expected for a new signing identity, EV included. Only "Unknown
Publisher" means the signature itself is not being recognized.

**Causes:**
- Publisher and file reputation not yet established (normal for every certificate type since 2024)
- Signing identity changed (a new certificate affects publisher reputation)
- Timestamp server not responding
- Signature invalid, or the file was modified after signing

**Solutions:**
- Verify signature: `signtool verify /pa file.exe`
- Ensure RFC 3161 timestamp server used (`/tr` flag)
- Keep signing every release with the same identity; reputation builds with clean downloads ([SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation))

#### 4. Azure Key Vault Authentication Failed

**Symptoms:**
```
ERROR: Unauthorized access to Key Vault
```

**Solutions:**
- Verify service principal has "Key Vault Certificate User" role
- Check tenant ID, client ID, client secret
- Ensure Key Vault firewall allows access
- Verify certificate name matches exactly

#### 5. Hardware Token Not Detected

**Symptoms:**
- Token not showing in Device Manager
- SafeNet client shows "No tokens found"

**Solutions:**
- Reinstall SafeNet Authentication Client drivers
- Try different USB port
- Check token is not locked (too many failed PIN attempts)
- Contact CA for token replacement

### Verification Commands

```powershell
# Verify signature details
signtool.exe verify /v /pa "Vision-Studio-<version>-Setup.exe"

# Display certificate information
signtool.exe verify /v /pa /c "Vision-Studio-<version>-Setup.exe"

# Check timestamp
signtool.exe verify /t "http://timestamp.digicert.com" "Vision-Studio-<version>-Setup.exe"

# PowerShell native verification
Get-AuthenticodeSignature "Vision-Studio-<version>-Setup.exe"
```

### Useful Resources

- [Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Azure Artifact Signing (formerly Trusted Signing)](https://learn.microsoft.com/en-us/azure/trusted-signing/)
- [Microsoft Code Signing Requirements](https://learn.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
- [DigiCert EV Code Signing Guide](https://www.digicert.com/friends/code-signing/ev-code-signing-certificate/)
- [Azure Key Vault HSM Documentation](https://learn.microsoft.com/en-us/azure/key-vault/keys/hsm-protected-keys)
- [Electron Code Signing Guide](https://www.electron.build/code-signing)

---

## Security Best Practices

1. **Never export private keys** from hardware token or HSM
2. **Rotate certificates** before expiration (renew 30 days early)
3. **Use separate certificates** for development and production
4. **Enable audit logging** for all signing operations
5. **Restrict CI/CD access** to signing credentials
6. **Monitor certificate expiration** with automated alerts
7. **Backup recovery keys** in secure offline location
8. **Use multi-signature** for critical releases (optional)

---

*Last Updated: 2026-11-12*
