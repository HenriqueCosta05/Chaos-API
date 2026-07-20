#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Inicializa e builda o ChaosAPI: prepara config, baixa deps, valida, builda, smoke-test.
.PARAMETER Run
    Sobe o servidor apos o build.
.PARAMETER ConfigPath
    Caminho da config a usar/gerar (default: application/configs/chaosapi.yaml).
.PARAMETER Force
    Sobrescreve a config existente com o template de exemplo.
.PARAMETER SkipTests
    Pula `go test ./...` (build mais rapido em iteracao local).
#>
[CmdletBinding()]
param(
    [switch]$Run,
    [string]$ConfigPath,
    [switch]$Force,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$appRoot = Join-Path $repoRoot 'application'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

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
            throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

# --- 1. Pre-flight ---------------------------------------------------------

Write-Step 'Checando dependencias de build'

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw 'Go nao encontrado no PATH. Instale em https://go.dev/dl/ antes de continuar.'
}
Write-Ok (go version)

# --- 2. Config ---------------------------------------------------------------

Write-Step 'Preparando configuracao'

$configDir = Join-Path $appRoot 'configs'
$exampleConfig = Join-Path $configDir 'chaosapi.yaml.example'
$targetConfig = if ($ConfigPath) { $ConfigPath } else { Join-Path $configDir 'chaosapi.yaml' }

if ((Test-Path $targetConfig) -and -not $Force) {
    Write-Ok "Config ja existe em $targetConfig (use -Force para sobrescrever)"
}
elseif (Test-Path $exampleConfig) {
    Copy-Item $exampleConfig $targetConfig -Force
    Write-Ok "Config criada em $targetConfig a partir do template"
}
else {
    Write-Warning "Nenhum template em $exampleConfig e nenhuma config em $targetConfig. Build vai continuar, mas o binario nao vai subir sem uma config valida."
}

# --- 3. Deps + testes ---------------------------------------------------------

Write-Step 'Baixando dependencias (go mod download)'
Invoke-CheckedCommand -Command 'go' -Arguments @('mod', 'download') -WorkingDirectory $appRoot
Invoke-CheckedCommand -Command 'go' -Arguments @('vet', './...') -WorkingDirectory $appRoot
Write-Ok 'go mod download + go vet ok'

if (-not $SkipTests) {
    Write-Step 'Rodando testes (go test ./...)'
    Invoke-CheckedCommand -Command 'go' -Arguments @('test', './...') -WorkingDirectory $appRoot
    Write-Ok 'Testes ok'
}
else {
    Write-Warning 'Testes pulados (-SkipTests)'
}

# --- 4. Build ------------------------------------------------------------------

Write-Step 'Buildando binario'

$buildDir = Join-Path $appRoot 'bin'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$version = try { git -C $repoRoot describe --tags --always --dirty 2>$null } catch { 'dev' }
if (-not $version) { $version = 'dev' }
$commit = try { git -C $repoRoot rev-parse --short HEAD 2>$null } catch { 'none' }
if (-not $commit) { $commit = 'none' }
$date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$binary = Join-Path $buildDir 'chaosapi.exe'
$ldflags = "-s -w -X main.version=$version -X main.commit=$commit -X main.date=$date"

Invoke-CheckedCommand -Command 'go' -Arguments @('build', '-ldflags', $ldflags, '-o', $binary, './cmd/chaosapi') -WorkingDirectory $appRoot
Write-Ok "Binario gerado em $binary (version=$version commit=$commit)"

# --- 5. Smoke test ---------------------------------------------------------------

Write-Step 'Smoke test do binario'
& $binary -version
if ($LASTEXITCODE -ne 0) {
    throw "Smoke test falhou: '$binary -version' saiu com codigo $LASTEXITCODE"
}
Write-Ok 'Binario executa corretamente'

# --- 6. Run (opcional) -----------------------------------------------------------

if ($Run) {
    Write-Step "Subindo ChaosAPI com config $targetConfig"
    & $binary -config $targetConfig
}
else {
    Write-Host ''
    Write-Host 'Pronto. Para rodar:' -ForegroundColor Cyan
    Write-Host "  $binary -config $targetConfig"
    Write-Host ''
    Write-Host 'Ou de novo com este script:' -ForegroundColor Cyan
    Write-Host '  ./scripts/bootstrap/bootstrap.ps1 -Run'
}
