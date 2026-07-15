#Requires -Version 7.0
# Builds and publishes application/ to npm. See deployment/README.md for the pipeline this mirrors.
param(
    [switch]$AllowDirty
)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")
$AppDir = Join-Path $RootDir "application"

if (-not $AllowDirty) {
    $status = git -C $RootDir status --porcelain
    if ($status) {
        Write-Error "Working tree has uncommitted changes. Commit/stash first, or pass -AllowDirty."
        exit 1
    }
}

npm whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not logged in to npm. Run 'npm login' (or set NPM_TOKEN) first."
    exit 1
}

Push-Location $AppDir
try {
    Write-Host "==> Typecheck"
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "==> Tests"
    npm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "==> Build"
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "==> Publish"
    npm publish --access public
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $pkgName = node -p "require('./package.json').name"
    $pkgVersion = node -p "require('./package.json').version"
    Write-Host ""
    Write-Host "Published $pkgName@$pkgVersion"
}
finally {
    Pop-Location
}
