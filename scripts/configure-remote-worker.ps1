[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$Url
)

$secureToken = Read-Host "Enter the TRYON_WORKER_TOKEN stored in Colab Secrets" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ($token.Length -lt 24) {
        throw "The worker token must contain at least 24 characters."
    }

    $repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
    $environmentPath = Join-Path $repositoryRoot ".env"
    $lines = @(
        "PORT=8787"
        "TRYON_PROVIDER=remote"
        "TRYON_PROVIDER_URL=$($Url.TrimEnd('/'))"
        "TRYON_PROVIDER_TOKEN=$token"
        "TRYON_PROVIDER_TIMEOUT_MS=180000"
        "TRYON_ALLOWED_ORIGINS=chrome-extension://*"
        "TRYON_MAX_IMAGE_BYTES=10485760"
        "TRYON_JOB_TTL_MINUTES=30"
    )
    [IO.File]::WriteAllLines($environmentPath, $lines, [Text.UTF8Encoding]::new($false))
    Write-Host "Remote worker configuration saved to $environmentPath"
    Write-Host "Restart the local API for the new tunnel URL to take effect."
}
finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    Remove-Variable token -ErrorAction SilentlyContinue
}
