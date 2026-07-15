#Requires -Version 7.0
# Installs deps and sanity-checks the toolchain for application/.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")
$AppDir = Join-Path $RootDir "application"

$RequiredNodeMajor = 18
$NodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt $RequiredNodeMajor) {
    Write-Error "Node >= $RequiredNodeMajor required, found $(node -v)"
    exit 1
}

Push-Location $AppDir
try {
    Write-Host "==> Installing dependencies (application/)"
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "==> Typecheck"
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "==> Tests"
    npm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ""
    Write-Host "Bootstrap done. Try:"
    Write-Host "  cd application; npm run dev     # dashboard dev server"
    Write-Host "  cd application; npm test        # test suite"
}
finally {
    Pop-Location
}
