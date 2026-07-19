#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [switch]$Run,
    [string]$ConfigPath
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

$configDir = Join-Path $appRoot 'configs'
$exampleConfig = Join-Path $configDir 'chaosapi.yaml.example'
$defaultConfig = if ($ConfigPath) { $ConfigPath } else { Join-Path $configDir 'chaosapi.yaml' }

if (-not (Test-Path $defaultConfig) -and (Test-Path $exampleConfig)) {
    Copy-Item $exampleConfig $defaultConfig
    Write-Host "Config criada em $defaultConfig"
}

Invoke-CheckedCommand -Command 'go' -Arguments @('mod', 'download') -WorkingDirectory $appRoot
Invoke-CheckedCommand -Command 'go' -Arguments @('test', './...') -WorkingDirectory $appRoot

$buildDir = Join-Path $appRoot 'bin'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$version = try { git -C $repoRoot describe --tags --always --dirty } catch { 'dev' }
$commit = try { git -C $repoRoot rev-parse --short HEAD } catch { 'none' }
$date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$binary = Join-Path $buildDir 'chaosapi.exe'
$ldflags = "-s -w -X main.version=$version -X main.commit=$commit -X main.date=$date"

Invoke-CheckedCommand -Command 'go' -Arguments @('build', '-ldflags', $ldflags, '-o', $binary, './cmd/chaosapi') -WorkingDirectory $appRoot

Write-Host "Binario gerado em $binary"

if ($Run) {
    & $binary -config $defaultConfig
}