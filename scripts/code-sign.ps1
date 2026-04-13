# =============================================================================
# Vision Studio Code Signing Script
# =============================================================================
# Purpose: Sign Windows executables and installers with EV certificate
# Requirements:
#   - EV Code Signing Certificate installed in certificate store OR
#   - Azure Key Vault / AWS HSM credentials configured
#   - Windows SDK (signtool.exe) installed
#
# Usage:
#   .\code-sign.ps1 -FilePath "C:\path\to\Vision Studio Setup.exe"
#   .\code-sign.ps1 -FilePath "C:\path\to\Vision Studio Setup.exe" -TimestampServer "http://timestamp.digicert.com"
#
# EV Certificate Requirements:
#   - DigiCert EV, Sectigo EV, or GlobalSign EV certificate
#   - Hardware token (SafeNet eToken) OR Cloud HSM (Azure Key Vault/AWS HSM)
#   - Certificate must be installed in Windows Certificate Store
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,

    [Parameter(Mandatory=$false)]
    [string]$TimestampServer = "http://timestamp.digicert.com",

    [Parameter(Mandatory=$false)]
    [string]$CertificateSubject = "Vision Studio Team",

    [Parameter(Mandatory=$false)]
    [switch]$VerifyOnly = $false,

    [Parameter(Mandatory=$false)]
    [switch]$UseAzureKeyVault = $false,

    [Parameter(Mandatory=$false)]
    [string]$AzureKeyVaultUrl = "",

    [Parameter(Mandatory=$false)]
    [string]$AzureCertificateName = "",

    [Parameter(Mandatory=$false)]
    [string]$CertificatePin
)

# =============================================================================
# Configuration
# =============================================================================
$ErrorActionPreference = "Stop"
$SignToolPath = "signtool.exe"

# RFC 3161 timestamp servers (more reliable than Authenticode)
$TimestampServers = @(
    "http://timestamp.digicert.com",
    "http://timestamp.sectigo.com",
    "http://timestamp.globalsign.com/tsa/r6advanced1"
)

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-SignTool {
    # Check if signtool.exe is available
    try {
        $signTool = Get-Command $SignToolPath -ErrorAction Stop
        Write-Log "Found signtool.exe at: $($signTool.Source)"
        return $true
    }
    catch {
        # Try to find in Windows SDK paths
        $sdkPaths = @(
            "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
            "C:\Program Files (x86)\Windows Kits\10\bin\x86\signtool.exe",
            "C:\Program Files (x86)\Windows Kits\8.1\bin\x64\signtool.exe",
            "C:\Program Files (x86)\Windows Kits\8.1\bin\x86\signtool.exe"
        )

        foreach ($path in $sdkPaths) {
            if (Test-Path $path) {
                $script:SignToolPath = $path
                Write-Log "Found signtool.exe at: $path"
                return $true
            }
        }

        Write-Log "ERROR: signtool.exe not found. Install Windows SDK." -Level "ERROR"
        return $false
    }
}

function Find-EVCertificate {
    # Search for EV certificate in certificate store
    Write-Log "Searching for EV certificate in certificate store..."

    try {
        # Navigate to certificate store
        $certStore = Get-ChildItem -Path Cert:\CurrentUser\My -ErrorAction SilentlyContinue
        if (-not $certStore) {
            $certStore = Get-ChildItem -Path Cert:\LocalMachine\My -ErrorAction SilentlyContinue
        }

        if ($certStore) {
            # Filter for code signing certificates with EV
            $evCerts = $certStore | Where-Object {
                $_.EnhancedKeyUsageList -match "Code Signing" -and
                $_.Subject -match $CertificateSubject
            }

            if ($evCerts) {
                $cert = $evCerts | Sort-Object NotAfter -Descending | Select-Object -First 1
                Write-Log "Found EV certificate: $($cert.Subject)"
                Write-Log "  Thumbprint: $($cert.Thumbprint)"
                Write-Log "  Expires: $($cert.NotAfter)"
                return $cert.Thumbprint
            }
        }

        Write-Log "WARNING: No EV certificate found matching '$CertificateSubject'" -Level "WARNING"
        return $null
    }
    catch {
        Write-Log "ERROR: Failed to search certificate store: $($_.Exception.Message)" -Level "ERROR"
        return $null
    }
}

<#
.SYNOPSIS
    Sign executable using Azure Key Vault HSM

.DESCRIPTION
    Signs files using Azure Key Vault stored certificates for EV code signing

.PARAMETER FileToSign
    Path to the file to be signed

.PARAMETER KeyVaultUrl
    Azure Key Vault resource URL

.PARAMETER CertificateName
    Name of the certificate in Key Vault

.REQUIRED ENVIRONMENT VARIABLES
    AZURE_TENANT_ID     - Azure AD tenant ID
    AZURE_CLIENT_ID     - Service principal client ID
    AZURE_CLIENT_SECRET - Service principal client secret
    AZURE_KEY_VAULT_URL - Key Vault resource URL
    AZURE_CERT_NAME     - Certificate name in Key Vault

.NOTES
    Requires AzureSignTool: dotnet tool install --global AzureSignTool
#>
function Sign-WithAzureKeyVault {
    param(
        [string]$FileToSign,
        [string]$KeyVaultUrl,
        [string]$CertificateName
    )

    Write-Log "Signing with Azure Key Vault: $KeyVaultUrl / $CertificateName"

    # Azure Sign Tool requires: https://github.com/vcsmsbl/AzureSignTool
    # Install: dotnet tool install --global AzureSignTool

    $azureSignTool = "azuresigntool"

    try {
        $cmd = @(
            "sign",
            "-kvu $KeyVaultUrl",
            "-kvc $CertificateName",
            "-kvt $($TimestampServer)",
            "-fd sha256",
            "-tr $($TimestampServer)",
            "`"$FileToSign`""
        )

        if ($CertificatePin) {
            $cmd += "-pin $CertificatePin"
        }

        & $azureSignTool $cmd
        return $?
    }
    catch {
        Write-Log "ERROR: Azure Sign Tool failed: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
}

function Sign-File {
    param(
        [string]$FileToSign,
        [string]$Thumbprint
    )

    Write-Log "Signing file: $FileToSign"

    # RFC 3161 timestamp servers with fallback order
    $TimestampServers = @(
        "http://timestamp.digicert.com",
        "http://timestamp.sectigo.com",
        "http://timestamp.globalsign.com"
    )

    # Build signtool command
    # /fd SHA256 - File digest algorithm
    # /a - Select best certificate automatically
    # /tr - RFC 3161 timestamp server
    # /td SHA256 - Timestamp digest algorithm

    $signed = $false

    foreach ($ts in $TimestampServers) {
        $arguments = @(
            "sign",
            "/fd SHA256",
            "/a",
            "/sha1 $Thumbprint",
            "/tr $ts",
            "/td SHA256",
            "/v",
            "`"$FileToSign`""
        )

        # Add optional PIN for hardware tokens
        if ($CertificatePin) {
            $arguments += "/p", $CertificatePin
        }

        Write-Log "Executing: $SignToolPath $($arguments -join ' ') (timestamp: $ts)"

        try {
            $process = Start-Process -FilePath $SignToolPath `
                -ArgumentList $arguments `
                -Wait -PassThru -NoNewWindow

            if ($process.ExitCode -eq 0) {
                Write-Log "Successfully signed: $FileToSign (timestamp server: $ts)" -Level "SUCCESS"
                $signed = $true
                break
            }
            else {
                Write-Log "WARNING: Signing failed with exit code $($process.ExitCode), trying next server..." -Level "WARNING"
            }
        }
        catch {
            Write-Log "WARNING: Signing process failed: $($_.Exception.Message), trying next server..." -Level "WARNING"
        }
    }

    if (-not $signed) {
        Write-Log "ERROR: All timestamp servers failed" -Level "ERROR"
        return $false
    }

    return $true
}

function Verify-Signature {
    param(
        [string]$FileToVerify
    )

    Write-Log "Verifying signature: $FileToVerify"

    $arguments = @(
        "verify",
        "/pa",  # Verify against driver policy (most strict)
        "/v",   # Verbose output
        "`"$FileToVerify`""
    )

    try {
        $process = Start-Process -FilePath $SignToolPath `
            -ArgumentList $arguments `
            -Wait -PassThru -NoNewWindow

        if ($process.ExitCode -eq 0) {
            Write-Log "Signature verification: PASSED" -Level "SUCCESS"
            return $true
        }
        else {
            Write-Log "ERROR: Signature verification failed (exit code $($process.ExitCode))" -Level "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "ERROR: Verification process failed: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
}

# =============================================================================
# Main Execution
# =============================================================================

Write-Log "========================================"
Write-Log "Vision Studio Code Signing"
Write-Log "========================================"

# Validate file exists
if (-not (Test-Path $FilePath)) {
    Write-Log "ERROR: File not found: $FilePath" -Level "ERROR"
    exit 1
}

$FileToSign = (Get-Item $FilePath).FullName
Write-Log "File to sign: $FileToSign"

# Check for signtool
if (-not (Test-SignTool)) {
    exit 1
}

# Azure Key Vault signing
if ($UseAzureKeyVault) {
    if (-not $AzureKeyVaultUrl -or -not $AzureCertificateName) {
        Write-Log "ERROR: Azure Key Vault URL and Certificate Name required" -Level "ERROR"
        exit 1
    }

    $signed = Sign-WithAzureKeyVault -FileToSign $FileToSign `
        -KeyVaultUrl $AzureKeyVaultUrl `
        -CertificateName $AzureCertificateName

    if ($signed) {
        $verified = Verify-Signature -FileToVerify $FileToSign
        if ($verified) {
            Write-Log "Code signing completed successfully!" -Level "SUCCESS"
            exit 0
        }
    }
    exit 1
}

# Local certificate store signing
$thumbprint = Find-EVCertificate

if (-not $thumbprint) {
    Write-Log "ERROR: No suitable EV certificate found. Please install certificate." -Level "ERROR"
    Write-Log ""
    Write-Log "Certificate installation options:" -Level "WARNING"
    Write-Log "  1. Hardware token: Insert SafeNet eToken and install drivers" -Level "WARNING"
    Write-Log "  2. Cloud HSM: Configure Azure Key Vault or AWS HSM" -Level "WARNING"
    Write-Log "  3. Local store: Import .pfx certificate (not recommended for EV)" -Level "WARNING"
    exit 1
}

# Sign the file
$signed = Sign-File -FileToSign $FileToSign -Thumbprint $thumbprint

if (-not $signed) {
    exit 1
}

# Verify the signature
$verified = Verify-Signature -FileToVerify $FileToSign

if ($verified) {
    Write-Log "========================================"
    Write-Log "Code signing completed successfully!" -Level "SUCCESS"
    Write-Log "========================================"
    exit 0
}
else {
    Write-Log "ERROR: Signature verification failed" -Level "ERROR"
    exit 1
}
