# Sets up these Claude Code mods on this computer. Safe to run again: it updates.
#
#   gh repo clone Spartan3100/claude-mods "$HOME\.claude\mods"; & "$HOME\.claude\mods\install.ps1"
#
# What it does:
#   1. Clones or updates this repo into ~/.claude/mods.
#   2. Loads every mod folder here at the start of each session (CLAUDE_CODE_PLUGIN_DIRS).
#   3. Adds the bundled benai-mods collection and installs its plugins.
# A backup of settings.json is written next to it first.

param(
  [string]$Repo = 'Spartan3100/claude-mods'
)
$ErrorActionPreference = 'Stop'

# Mods in this folder that should not load: screen-share comes from benai-mods instead.
$SkipLocal = @('screen-share')
# Plugins from the bundled benai-mods collection. cache-clock is left out: cache-keeper does its job.
$Benai = @('brain-dump', 'helper-desk', 'handoff', 'reflect', 'chat-inventory', 'screen-share', 'replay-theater', 'mods')

$claudeDir = Join-Path $HOME '.claude'
$modsDir = Join-Path $claudeDir 'mods'
$settingsPath = Join-Path $claudeDir 'settings.json'

foreach ($tool in 'git', 'claude') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed or not on PATH." }
}

# 1. The repo
if (Test-Path (Join-Path $modsDir '.git')) {
  Write-Host 'Updating mods...'
  git -C $modsDir pull --ff-only
} elseif (Test-Path $modsDir) {
  throw "$modsDir exists but is not this repo. Move it aside and run again."
} else {
  Write-Host 'Downloading mods...'
  if (Get-Command gh -ErrorAction SilentlyContinue) { gh repo clone $Repo $modsDir } else { git clone "https://github.com/$Repo.git" $modsDir }
}

# 2. Settings: load each local mod, and know where benai-mods lives
$mods = Get-ChildItem $modsDir -Directory |
  Where-Object { (Test-Path (Join-Path $_.FullName 'hooks\hooks.json')) -and ($SkipLocal -notcontains $_.Name) } |
  ForEach-Object { $_.FullName }

if (Test-Path $settingsPath) {
  Copy-Item $settingsPath "$settingsPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
  $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
  $settings = [pscustomobject]@{}
}
function Set-Prop($obj, $name, $value) {
  if ($obj.PSObject.Properties[$name]) { $obj.$name = $value } else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}
foreach ($key in 'env', 'extraKnownMarketplaces') {
  if (-not $settings.PSObject.Properties[$key]) { Set-Prop $settings $key ([pscustomobject]@{}) }
}
Set-Prop $settings.env 'CLAUDE_CODE_PLUGIN_DIRS' ($mods -join ';')
Set-Prop $settings.extraKnownMarketplaces 'benai-mods' ([pscustomobject]@{
  source = [pscustomobject]@{ source = 'directory'; path = (Join-Path $modsDir 'benai-mods') }
})
$settings | ConvertTo-Json -Depth 32 | Set-Content $settingsPath -Encoding utf8

# 3. benai-mods plugins
claude plugin marketplace update benai-mods 2>$null | Out-Null
foreach ($name in $Benai) {
  $out = claude plugin install "$name@benai-mods" 2>&1
  if ($LASTEXITCODE -ne 0 -and "$out" -notmatch 'already') { Write-Warning "$name : $out" }
}

Write-Host ''
Write-Host "Done. Loaded on every new session: $(($mods | Split-Path -Leaf) -join ', ')"
Write-Host "Plus from benai-mods: $($Benai -join ', ')"
Write-Host 'Open a new Claude Code chat to see them.'
