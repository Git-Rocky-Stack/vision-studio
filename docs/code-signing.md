# EV Code Signing for Vision Studio

This document covers the complete process for implementing EV (Extended Validation) code signing for the Vision Studio Electron desktop application on Windows.

## Table of Contents

1. [EV Certificate Requirements](#ev-certificate-requirements)
2. [Certificate Providers](#certificate-providers)
3. [Hardware Token vs Cloud HSM](#hardware-token-vs-cloud-hsm)
4. [Installation Steps](#installation-steps)
5. [Signing Process](#signing-process)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## EV Certificate Requirements

### Why EV Code Signing?

EV (Extended Validation) code signing certificates provide:

- **Immediate SmartScreen Reputation**: Unlike standard code signing, EV certificates establish immediate trust with Microsoft SmartScreen
- **Highest Level of Validation**: Requires rigorous business verification
- **Hardware Security**: Private keys stored in hardware tokens or cloud HSM (FIPS 140-2 Level 2+)
- **Enterprise Trust**: Required for enterprise distribution and some corporate environments

### Requirements Summary

| Requirement | Description |
|-------------|-------------|
| **Business Verification** | Legal business entity registration required |
| **Hardware Token** | SafeNet eToken 5110 or cloud HSM (Azure Key Vault/AWS HSM) |
| **Certificate Validity** | 1-3 years (renewable) |
| **SHA-256 Signing** | Mandatory for all Windows executables |
| **RFC 3161 Timestamp** | Required for signature persistence |

---

## Certificate Providers

### Recommended EV Certificate Authorities

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

### Step 1: Obtain EV Certificate

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
   .\scripts\code-sign.ps1 -FilePath "release\Vision Studio Setup.exe"
   ```

3. **Verify signature**:
   ```powershell
   signtool.exe verify /pa "release\Vision Studio Setup.exe"
   ```

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
     -FilePath "release\Vision Studio Setup.exe" `
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
| Windows certificate store / hardware token | `WIN_CSC_SUBJECT_NAME` or `WIN_CSC_SHA1` |
| Azure Trusted Signing | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, one Azure auth method such as `AZURE_CLIENT_SECRET`, plus `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, and `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME` |

Local verification:

```powershell
npm run release:signing:check
npm run build
npm run package:win:signed
```

For Azure Trusted Signing, the packaging wrapper passes the required
`win.azureSignOptions` values to electron-builder at runtime so local unsigned
packaging with `npm run package:win` remains available for development builds.

---

## CI/CD Integration

Production releases are built by `.github/workflows/release.yml` (triggered by a
`v*` tag) on `windows-latest`. The `build-windows` job:

1. Runs the signing **preflight** - `npm run release:signing:check` - which fails
   the build if no supported signing configuration is present, so no *unsigned*
   production artifact can ever be produced or uploaded.
2. Packages with `npm run package:win:signed`, which re-checks readiness and
   passes the mode-specific options to electron-builder at runtime.

Both steps receive the signing secrets via `env:` (see the workflow). The
preflight (`scripts/verify-release-signing.cjs`) selects the first configured
mode in this order: **CSC/PFX -> Windows cert-store/token -> Azure Trusted
Signing**, matching the modes table in [Signing Process](#signing-process).

### Required GitHub repository secrets

Configure the secrets for **exactly one** mode (repo Settings -> Secrets and
variables -> Actions). The workflow references all of them, but only one complete
set must be present for the preflight to pass.

| Mode | Secrets |
|------|---------|
| **CSC / PFX** | `WIN_CSC_LINK` (or `CSC_LINK`) - base64 or URL of the `.pfx`; plus `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`) |
| **Windows cert-store / hardware token** | `WIN_CSC_SUBJECT_NAME` (or `WIN_CSC_SHA1`) - selects an installed certificate by subject name or SHA-1 thumbprint |
| **Azure Trusted Signing** (recommended for CI) | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus one auth secret: `AZURE_CLIENT_SECRET`, `AZURE_CLIENT_CERTIFICATE_PATH`, or `AZURE_USERNAME` + `AZURE_PASSWORD` |

> **Action required (repo owner):** the workflow is correctly wired, but it can
> only pass once the secret **values** for one mode are set in GitHub - these
> cannot live in the repository. Until then the signed `build-windows` job fails
> fast at the preflight, by design (this is the audit's "signing preflight failed
> locally" behavior, working as intended).

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
[ERROR] No EV certificate found matching 'Vision Studio Team'
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

**Causes:**
- EV certificate reputation not yet established
- Timestamp server not responding
- Signature invalid

**Solutions:**
- Verify signature: `signtool verify /pa file.exe`
- Ensure RFC 3161 timestamp server used (`/tr` flag)
- Build reputation by distributing signed builds

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
signtool.exe verify /v /pa "Vision Studio Setup.exe"

# Display certificate information
signtool.exe verify /v /pa /c "Vision Studio Setup.exe"

# Check timestamp
signtool.exe verify /t "http://timestamp.digicert.com" "Vision Studio Setup.exe"

# PowerShell native verification
Get-AuthenticodeSignature "Vision Studio Setup.exe"
```

### Useful Resources

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

*Last Updated: 2026-06-08*
