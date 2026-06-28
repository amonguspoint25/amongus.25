# Set-HostKey.ps1 — paste + validate + save your ranked host key (no manual config editing).
# Place this next to "Among Us.exe" (the modded copy). Double-click "Set Host Key.bat" to run it.

$cfg = Join-Path $PSScriptRoot 'BepInEx\config\com.amongus25.gamewatcher.cfg'
if (-not (Test-Path -LiteralPath $cfg)) {
    Write-Host 'Mod config not found.' -ForegroundColor Yellow
    Write-Host 'Launch Among Us once (so the mod creates its config), then run this again.'
    Read-Host 'Press Enter to exit'
    exit 1
}

$lines    = Get-Content -LiteralPath $cfg
$baseLine = $lines | Where-Object { $_ -match '^\s*WebsiteBaseUrl\s*=' } | Select-Object -First 1
$baseUrl  = if ($baseLine) { ($baseLine -replace '^\s*WebsiteBaseUrl\s*=\s*', '').Trim().TrimEnd('/') } else { 'https://au-25.vercel.app' }

Write-Host ''
Write-Host "Ranked site: $baseUrl" -ForegroundColor Cyan
Write-Host 'Get your host key from the site (/host page), then paste it below.'
Write-Host ''
$key = (Read-Host 'Paste host key and press Enter').Trim()
# A host key (amrk_<base64url>) never contains whitespace. If a paste dragged in trailing text
# (e.g. the website's old "... copy now" note), keep only the first token so it still validates.
$key = ($key -split '\s+')[0]
if (-not $key) {
    Write-Host 'No key entered. Nothing changed.' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host 'Checking the key against the site...'
$code = 0
try {
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/host/status" -Method GET `
        -Headers @{ Authorization = "Bearer $key" } -UseBasicParsing -TimeoutSec 15
    $code = [int]$resp.StatusCode
} catch {
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { $code = -1 }
}

Write-Host ''
if ($code -eq 200) {
    $new = $lines -replace '^\s*HostKey\s*=.*', "HostKey = $key"
    [System.IO.File]::WriteAllLines($cfg, $new, (New-Object System.Text.UTF8Encoding($false)))
    # Verify it actually persisted by reading the file back.
    $saved = ((Get-Content -LiteralPath $cfg | Where-Object { $_ -match '^\s*HostKey\s*=' }) -replace '^\s*HostKey\s*=\s*', '').Trim()
    if ($saved -eq $key) {
        Write-Host 'APPROVED - host key valid and SAVED (verified).' -ForegroundColor Green
        Write-Host '(Re)launch Among Us; /ranked status will show "key valid".'
    } else {
        Write-Host 'Key is VALID, but writing it to the config did not stick.' -ForegroundColor Yellow
        Write-Host 'Close Among Us, run this again -- or paste the key into the HostKey = line in:'
        Write-Host "  $cfg"
    }
} elseif ($code -eq 401) {
    Write-Host 'REJECTED (401) - that key is wrong or revoked. Nothing saved.' -ForegroundColor Red
} elseif ($code -eq -1) {
    Write-Host "Could not reach $baseUrl - check your internet or WebsiteBaseUrl in the config." -ForegroundColor Red
} else {
    Write-Host "Unexpected response ($code). Nothing saved." -ForegroundColor Yellow
}
Read-Host 'Press Enter to exit'
