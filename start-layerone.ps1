$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostName = "127.0.0.1"
$port = "8791"

Set-Location $projectRoot

Write-Host ""
Write-Host "LayerOne MVP" -ForegroundColor Green
Write-Host "Servidor local: http://$hostName`:$port" -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para encerrar." -ForegroundColor DarkGray
Write-Host ""

node .\local-server.js
