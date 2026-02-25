#Requires -Version 5.1
# deploy.ps1 - Init/update for dnds-gofrugal-synker (Windows)
# Usage: .\deploy.ps1 init | .\deploy.ps1 update

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/Ciddarth-raaj/dnds-gofrugal-synker.git"
$RepoName = "dnds-gofrugal-synker"

# Remove msstore source once to avoid certificate error 0x8a15005e. Requires Administrator.
function Ensure-WingetSource {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { return }
  if ($script:WingetSourceFixed) { return }
  Write-Host "Removing winget 'msstore' source to avoid certificate error 0x8a15005e..."
  $result = winget source remove --name msstore 2>&1 | Out-String
  $script:WingetSourceFixed = $true
  # Success, or already removed (source not found)
  if ($LASTEXITCODE -eq 0 -or $result -match "not found|does not exist|Unknown argument") { return }
  Write-Host ""
  Write-Host "The msstore source could not be removed (often needs Administrator)."
  Write-Host "Do this once, then run this script again:"
  Write-Host "  1. Right-click PowerShell -> Run as administrator"
  Write-Host "  2. Run: winget source remove --name msstore"
  Write-Host "  3. Close and run: .\deploy.ps1 init"
  Write-Host ""
  exit 1
}

function Ensure-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) { return }
  Write-Host "Git not found. Installing via winget..."
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Winget not found. Install Git from https://git-scm.com/download/win"
    exit 1
  }
  Ensure-WingetSource
  winget install --id Git.Git -e -h --source winget --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git was installed. Please close and reopen PowerShell, then run this script again."
    exit 1
  }
  Write-Host "Git is ready."
}

function Ensure-Node {
  if ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)) { return }
  Write-Host "Node.js or npm not found. Installing via winget..."
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Winget not found. Install Node.js from https://nodejs.org"
    exit 1
  }
  Ensure-WingetSource
  winget install --id OpenJS.NodeJS.LTS -e -h --source winget --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js was installed. Please close and reopen PowerShell, then run this script again."
    exit 1
  }
  Write-Host "Node.js is ready."
}

function Ensure-PM2 {
  if (Get-Command pm2 -ErrorAction SilentlyContinue) { return }
  Write-Host "PM2 not found. Installing globally..."
  npm install -g pm2
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  Write-Host "PM2 is ready."
}

function Get-RepoRoot {
  if (Test-Path "ecosystem.config.cjs") { return (Get-Location).Path }
  if (Test-Path (Join-Path $RepoName "ecosystem.config.cjs")) { return (Join-Path (Get-Location).Path $RepoName) }
  return $null
}

function Prompt-Env {
  param([string]$Key, [string]$Default)
  if ($Default -ne "") {
    $val = Read-Host "$Key [$Default]"
    if ([string]::IsNullOrWhiteSpace($val)) { return $Default }
    return $val
  }
  return Read-Host $Key
}

function Create-RootEnv {
  param([string]$Dir)
  Write-Host "Creating root .env (press Enter to accept default when shown)."
  $PORT = Prompt-Env "PORT" "9003"
  $FRONTEND_PORT = Prompt-Env "FRONTEND_PORT" "9004"
  $MSSQL_USER = Prompt-Env "MSSQL_USER" "sa"
  $MSSQL_PASSWORD = Prompt-Env "MSSQL_PASSWORD" "your_password"
  $MSSQL_SERVER = Prompt-Env "MSSQL_SERVER" "DN13"
  $MSSQL_INSTANCE = Prompt-Env "MSSQL_INSTANCE" "GFT"
  $MSSQL_DATABASE = Prompt-Env "MSSQL_DATABASE" "master"
  $MSSQL_ENCRYPT = Prompt-Env "MSSQL_ENCRYPT" "false"
  $MSSQL_TRUST_SERVER_CERTIFICATE = Prompt-Env "MSSQL_TRUST_SERVER_CERTIFICATE" "true"
  $GOFRUGAL_SYNKER_BASE_URL = Prompt-Env "GOFRUGAL_SYNKER_BASE_URL" "http://localhost:8080"
  $SYNC_BATCH_SIZE = Prompt-Env "SYNC_BATCH_SIZE" "5000"
  $IS_DEV = Prompt-Env "IS_DEV" "false"
  $DEV_TABLES_JSON = Prompt-Env "DEV_TABLES_JSON" "config/dev-tables.json"

  $content = @"
# Backend server port (default 3080)
PORT=$PORT

# Frontend port when run separately with PM2
FRONTEND_PORT=$FRONTEND_PORT

# SQL Server (GoFrugal source)
MSSQL_USER=$MSSQL_USER
MSSQL_PASSWORD=$MSSQL_PASSWORD
MSSQL_SERVER=$MSSQL_SERVER
MSSQL_INSTANCE=$MSSQL_INSTANCE
MSSQL_DATABASE=$MSSQL_DATABASE
MSSQL_ENCRYPT=$MSSQL_ENCRYPT
MSSQL_TRUST_SERVER_CERTIFICATE=$MSSQL_TRUST_SERVER_CERTIFICATE

# Gofrugal Synker API
GOFRUGAL_SYNKER_BASE_URL=$GOFRUGAL_SYNKER_BASE_URL

SYNC_BATCH_SIZE=$SYNC_BATCH_SIZE
IS_DEV=$IS_DEV
DEV_TABLES_JSON=$DEV_TABLES_JSON
"@
  Set-Content -Path (Join-Path $Dir ".env") -Value $content -Encoding UTF8
  Write-Host "Wrote $Dir\.env"
  $PORT
}

function Create-FrontendEnv {
  param([string]$Dir, [string]$BackendPort)
  $viteApiUrl = "http://localhost:$BackendPort"
  $frontendDir = Join-Path $Dir "frontend"
  if (-not (Test-Path $frontendDir)) { New-Item -ItemType Directory -Path $frontendDir -Force | Out-Null }
  Set-Content -Path (Join-Path $frontendDir ".env") -Value "# Generated by deploy.ps1`nVITE_API_URL=$viteApiUrl" -Encoding UTF8
  Write-Host "Wrote $frontendDir\.env (VITE_API_URL=$viteApiUrl)"
}

function Cmd-Init {
  Ensure-Git
  Ensure-Node
  Ensure-PM2

  if (Test-Path $RepoName) {
    Write-Host "Directory $RepoName already exists. Use 'update' or remove it first."
    exit 1
  }
  Write-Host "Cloning $RepoUrl into .\$RepoName ..."
  git clone $RepoUrl $RepoName
  $targetDir = Join-Path (Get-Location).Path $RepoName
  Set-Location $targetDir

  $backendPort = Create-RootEnv -Dir $targetDir
  if ([string]::IsNullOrWhiteSpace($backendPort)) { $backendPort = "9003" }
  Create-FrontendEnv -Dir $targetDir -BackendPort $backendPort

  Write-Host "Installing dependencies (root)..."
  npm install
  Write-Host "Installing and building frontend..."
  Push-Location frontend
  npm install
  npm run build
  Pop-Location

  Write-Host "Starting PM2..."
  pm2 start ecosystem.config.cjs
  Write-Host "Init complete. Backend and frontend are running under PM2."
  pm2 list
}

function Cmd-Update {
  $root = Get-RepoRoot
  if (-not $root) {
    Write-Host "Run this script from the repo root (where ecosystem.config.cjs is) or from the directory that contains $RepoName."
    exit 1
  }
  Set-Location $root
  Ensure-Node
  Ensure-PM2

  Write-Host "Pulling latest changes..."
  git pull
  Write-Host "Installing dependencies (root)..."
  npm install
  Write-Host "Installing and building frontend..."
  Push-Location frontend
  npm install
  npm run build
  Pop-Location
  Write-Host "Restarting PM2 (stop then start for a clean frontend)..."
  pm2 delete gofrugaldbsynker-backend gofrugaldbsynker-frontend 2>$null
  pm2 start ecosystem.config.cjs
  Write-Host "Update complete."
  pm2 list
}

# Main
$cmd = $args[0]
switch ($cmd) {
  "init"  { Cmd-Init }
  "update" { Cmd-Update }
  default {
    Write-Host "Usage: .\deploy.ps1 <init|update>"
    Write-Host "  init   - Clone repo, prompt for .env, install, build, and start with PM2"
    Write-Host "  update - Pull latest, install, build, and restart PM2"
    exit 1
  }
}
