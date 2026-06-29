# Set-HostKey.ps1 — paste + validate + save your ranked host key (no manual config editing).
# IMPORTANT: close Among Us before running this (the game can lock the config file).
# Place next to "Among Us.exe"; double-click "Set Host Key.bat".

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Finish([int]$exitCode) {
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit $exitCode
}

try {
    $cfg = Join-Path $PSScriptRoot 'BepInEx\config\com.amongus25.gamewatcher.cfg'
    if (-not (Test-Path -LiteralPath $cfg)) {
        Write-Host 'Mod config not found.' -ForegroundColor Yellow
        Write-Host 'Launch Among Us once (so the mod creates its config), then run this again.'
        Finish 1
    }

    $lines    = Get-Content -LiteralPath $cfg
    $baseLine = $lines | Where-Object { $_ -match '^\s*WebsiteBaseUrl\s*=' } | Select-Object -First 1
    $baseUrl  = if ($baseLine) { ($baseLine -replace '^\s*WebsiteBaseUrl\s*=\s*', '').Trim().TrimEnd('/') } else { 'https://amongus25.com' }

    Write-Host ''
    Write-Host "Ranked site: $baseUrl" -ForegroundColor Cyan
    Write-Host 'Paste your host key (from the site /host page) and press Enter.'
    Write-Host ''
    $key = (Read-Host 'Host key').Trim()
    $key = ($key -split '\s+')[0]   # keep only the key, drop any pasted trailing text
    if (-not $key) {
        Write-Host 'No key entered. Nothing changed.' -ForegroundColor Yellow
        Finish 1
    }

    Write-Host 'Checking the key against the site...'
    $code = 0
    try {
        $resp = Invoke-WebRequest -Uri "$baseUrl/api/host/status" -Method GET `
            -Headers @{ Authorization = "Bearer $key" } -UseBasicParsing -TimeoutSec 20
        $code = [int]$resp.StatusCode
    } catch {
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { $code = -1 }
    }

    Write-Host ''
    if ($code -eq 200) {
        $new = $lines -replace '^\s*HostKey\s*=.*', "HostKey = $key"
        try {
            [System.IO.File]::WriteAllLines($cfg, $new, (New-Object System.Text.UTF8Encoding($false)))
        } catch {
            Write-Host 'Key is VALID, but the config file is locked (is Among Us still open?).' -ForegroundColor Yellow
            Write-Host 'Close Among Us and run this again, or paste the key into HostKey = in:'
            Write-Host "  $cfg"
            Finish 1
        }
        $saved = ((Get-Content -LiteralPath $cfg | Where-Object { $_ -match '^\s*HostKey\s*=' }) -replace '^\s*HostKey\s*=\s*', '').Trim()
        if ($saved -eq $key) {
            Write-Host 'APPROVED - host key valid and SAVED (verified).' -ForegroundColor Green
            Write-Host '(Re)launch Among Us; /ranked status will show "key valid".'
        } else {
            Write-Host 'Key is VALID but the saved value did not match. Paste it into HostKey = in:' -ForegroundColor Yellow
            Write-Host "  $cfg"
        }
    } elseif ($code -eq 401) {
        Write-Host 'REJECTED (401) - that key is wrong or revoked. Nothing saved.' -ForegroundColor Red
    } elseif ($code -eq -1) {
        Write-Host "Could not reach $baseUrl - check your internet or WebsiteBaseUrl in the config." -ForegroundColor Red
    } else {
        Write-Host "Unexpected response ($code). Nothing saved." -ForegroundColor Yellow
    }
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '(Tell the mod author this message if it persists.)'
}

Finish 0
