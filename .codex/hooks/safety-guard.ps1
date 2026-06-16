# safety-guard.ps1 — Independent safety hook (PreToolUse:Bash)
# No external dependencies. Intercepts dangerous commands before execution.
#
# Exit code protocol:
#   0 + stdout  "deny"  -> blocks command, shows warning
#   0 + stdout  "ask"   -> rewrites command with confirmation prompt prepended
#   1           pass through (safe or unrecognized)
#
# Guarded operations:
#   - git push --force / --force-with-lease to main/master (deny)
#   - git push --force / --force-with-lease to other branches (ask)
#   - Remove-Item -Recurse -Force on non-temp paths (ask)
#   - rm -rf outside /tmp (ask)
#   - Writing to system directories: C:\Windows, /etc, /usr, /boot (deny)

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

$normalized = $cmd.Trim()

# --- git push --force detection ---
if ($normalized -match 'git\s+push\s+.*(--force|--force-with-lease|-[^-]*f\b)') {
    $branch = ''
    if ($normalized -match 'git\s+push\s+.*?\s+(\S+)\s*$') {
        $branch = $matches[1]
    }

    if ($branch -eq 'main' -or $branch -eq 'master' -or $branch -eq 'origin/main' -or $branch -eq 'origin/master') {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'deny'
                permissionDecisionReason = "Force push to $branch is blocked by safety guard. Use a feature branch or manually confirm via git CLI outside Claude Code."
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }

    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            permissionDecision = 'ask'
            permissionDecisionReason = "Force push to '$branch' requires confirmation. Are you sure?"
        }
    } | ConvertTo-Json -Compress
    Write-Output $output
    exit 0
}

# --- Dangerous Remove-Item detection ---
if ($normalized -match 'Remove-Item\s+.*(-Recurse|-r)\s+.*(-Force)') {
    $isSafe = ($normalized -match '\$env:TEMP|/tmp|/var/tmp|\\AppData\\Local\\Temp')
    if (-not $isSafe) {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'ask'
                permissionDecisionReason = 'Dangerous recursive force delete detected. Confirm target path is correct.'
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }
}

# --- rm -rf outside safe dirs ---
if ($normalized -match 'rm\s+.*(-rf|-fr|--recursive.*--force|--force.*--recursive)') {
    $isSafe = ($normalized -match '/tmp|/var/tmp|\$TEMP|\$env:TEMP|node_modules|\.worktrees|\.git/')
    if (-not $isSafe) {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'ask'
                permissionDecisionReason = 'Dangerous recursive force remove detected. Confirm target path is correct.'
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }
}

# --- Write to system directories (deny) ---
$sysDirs = @(
    'C:\\Windows', '/etc', '/usr', '/boot', '/lib', '/bin', '/sbin',
    '/System', '/Library', 'C:\\Program Files', 'C:\\Program Files (x86)'
)
foreach ($dir in $sysDirs) {
    $escapedDir = [regex]::Escape($dir)
    if ($normalized -match "$escapedDir") {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'deny'
                permissionDecisionReason = "Writing to system directory '$dir' is blocked by safety guard."
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }
}

# Pass through — command is safe
exit 1
