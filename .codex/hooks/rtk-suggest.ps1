# rtk-suggest.ps1 — RTK suggestion hook (PreToolUse:Bash)
# Emits systemMessage when RTK-compatible commands are detected.
# Does NOT modify command execution — pure suggestion.
# Generated but NOT registered in settings.json by default.
#
# Exit code protocol:
#   0 + stdout (with systemMessage) -> Claude Code shows suggestion
#   1 -> pass through (no suggestion)

param()

$ErrorActionPreference = 'Stop'

$inputJson = $input | Out-String
if (-not $inputJson) { exit 1 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    exit 1
}

$cmd = $data.tool_input.command
if (-not $cmd) { exit 1 }

$firstCmd = ($cmd -split '\s*\|\s*|\s*&&\s*|\s*\|\|\s*')[0].Trim()

# Already using rtk? Skip
if ($firstCmd -match '^rtk\s') { exit 1 }

# Skip heredocs
if ($firstCmd -match '<<') { exit 1 }

$suggestion = ''

# Git commands
if ($firstCmd -match '^git\s+status(\s|$)')    { $suggestion = 'rtk git status' }
elseif ($firstCmd -match '^git\s+diff(\s|$)')   { $suggestion = 'rtk git diff' }
elseif ($firstCmd -match '^git\s+log(\s|$)')    { $suggestion = 'rtk git log' }
elseif ($firstCmd -match '^git\s+add(\s|$)')    { $suggestion = 'rtk git add' }
elseif ($firstCmd -match '^git\s+commit(\s|$)') { $suggestion = 'rtk git commit' }
elseif ($firstCmd -match '^git\s+push(\s|$)')   { $suggestion = 'rtk git push' }
elseif ($firstCmd -match '^git\s+pull(\s|$)')   { $suggestion = 'rtk git pull' }
elseif ($firstCmd -match '^git\s+branch(\s|$)') { $suggestion = 'rtk git branch' }
elseif ($firstCmd -match '^git\s+fetch(\s|$)')  { $suggestion = 'rtk git fetch' }
elseif ($firstCmd -match '^git\s+stash(\s|$)')  { $suggestion = 'rtk git stash' }

# Cargo commands
elseif ($firstCmd -match '^cargo\s+test(\s|$)')   { $suggestion = 'rtk cargo test' }
elseif ($firstCmd -match '^cargo\s+build(\s|$)')  { $suggestion = 'rtk cargo build' }
elseif ($firstCmd -match '^cargo\s+clippy(\s|$)') { $suggestion = 'rtk cargo clippy' }
elseif ($firstCmd -match '^cargo\s+check(\s|$)')  { $suggestion = 'rtk cargo check' }
elseif ($firstCmd -match '^cargo\s+fmt(\s|$)')    { $suggestion = 'rtk cargo fmt' }

# File ops
elseif ($firstCmd -match '^cat\s+')               { $suggestion = $cmd -replace '^cat\s+', 'rtk read ' }
elseif ($firstCmd -match '^(rg|grep)\s+')         { $suggestion = $cmd -replace '^(rg|grep)\s+', 'rtk grep ' }
elseif ($firstCmd -match '^ls(\s|$)')             { $suggestion = $cmd -replace '^ls(\s|$)', 'rtk ls$1' }

# GitHub CLI
elseif ($firstCmd -match '^gh\s+(pr|issue|run)(\s|$)') { $suggestion = $cmd -replace '^gh\s+', 'rtk gh ' }

# Docker
elseif ($firstCmd -match '^docker\s+(ps|images|logs)(\s|$)') { $suggestion = $cmd -replace '^docker\s+', 'rtk docker ' }

# Node.js
elseif ($firstCmd -match '^(npx\s+)?vitest(\s|$)')  { $suggestion = 'rtk vitest' }
elseif ($firstCmd -match '^(npx\s+)?tsc(\s|$)')     { $suggestion = 'rtk tsc' }
elseif ($firstCmd -match '^(npx\s+)?eslint(\s|$)')  { $suggestion = 'rtk lint' }

if (-not $suggestion) { exit 1 }

$output = @{
    hookSpecificOutput = @{
        hookEventName = 'PreToolUse'
        permissionDecision = 'allow'
        systemMessage = "`u{26A1} RTK available: ``$suggestion`` (60-90% token savings)"
    }
} | ConvertTo-Json -Compress

Write-Output $output
exit 0
