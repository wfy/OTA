$ErrorActionPreference = 'SilentlyContinue'
$ids = (Get-NetTCPConnection -LocalPort 3000,8000 -State Listen).OwningProcess | Select-Object -Unique
if ($ids) {
  Write-Host '[OTA] ports 3000/8000 occupied by:'
  Get-Process -Id $ids | Select-Object Id, ProcessName | Format-Table -AutoSize
  $r = Read-Host 'Kill these processes? (y/N)'
  if ($r -eq 'y' -or $r -eq 'Y') {
    Stop-Process -Id $ids -Force
    Write-Host '[OTA] killed stale processes.'
  }
} else {
  Write-Host '[OTA] ports free.'
}
