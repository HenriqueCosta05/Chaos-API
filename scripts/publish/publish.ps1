#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$OutputDir = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..\dist')
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$appRoot = Join-Path $repoRoot 'application'

function Invoke-CheckedCommand {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw 'Go nao encontrado no PATH.'
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$version = try { git -C $repoRoot describe --tags --always --dirty } catch { 'dev' }
$commit = try { git -C $repoRoot rev-parse --short HEAD } catch { 'none' }
$date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$artifactRoot = Join-Path $OutputDir "chaosapi-$version"
$binDir = Join-Path $artifactRoot 'bin'
$configDir = Join-Path $artifactRoot 'configs'
New-Item -ItemType Directory -Force -Path $binDir, $configDir | Out-Null

$binary = Join-Path $binDir 'chaosapi.exe'
$ldflags = "-s -w -X main.version=$version -X main.commit=$commit -X main.date=$date"

Invoke-CheckedCommand -Command 'go' -Arguments @('build', '-ldflags', $ldflags, '-o', $binary, './cmd/chaosapi') -WorkingDirectory $appRoot

$exampleConfig = Join-Path $appRoot 'configs\chaosapi.yaml.example'
if (Test-Path $exampleConfig) {
    Copy-Item $exampleConfig (Join-Path $configDir 'chaosapi.yaml.example')
}

$archivePath = Join-Path $OutputDir "chaosapi-$version-windows-amd64.zip"
if (Test-Path $archivePath) { Remove-Item $archivePath -Force }
Compress-Archive -Path (Join-Path $artifactRoot '*') -DestinationPath $archivePath -Force

$hash = Get-FileHash -Algorithm SHA256 $archivePath
$hashFile = "$archivePath.sha256"
Set-Content -Path $hashFile -Value "$($hash.Hash)  $([System.IO.Path]::GetFileName($archivePath))"

Write-Host "Artefato publicado em $archivePath"
Write-Host "Checksum em $hashFile"