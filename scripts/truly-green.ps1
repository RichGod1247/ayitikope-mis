# scripts/truly-green.ps1
$ErrorActionPreference = "Stop"

$pattern = "/api/test/tenants|test/tenants"
$path = "src"

rg --quiet $pattern $path
$code = $LASTEXITCODE

# rg exit codes:
# 0 = matches found
# 1 = no matches found
# 2 = error
if ($code -eq 0) {
  Write-Host "NOT GREEN: forbidden pattern still exists -> $pattern"
  rg $pattern $path
  exit 1
}
elseif ($code -eq 1) {
  Write-Host "GREEN: no forbidden patterns found -> $pattern"
  exit 0
}
else {
  Write-Host "ERROR: ripgrep failed (exit $code)"
  exit $code
}
