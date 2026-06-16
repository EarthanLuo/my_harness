# rtk-rewrite.ps1 — RTK command rewrite hook (PreToolUse:Bash)
# PowerShell port of rtk-rewrite.sh semantics.
#
# Exit code protocol (matching RTK's `rtk rewrite`):
#   0 + stdout  Rewrite found -> auto-allow
#   1           No RTK equivalent -> pass through (no rewrite)
#   2           Deny rule -> pass through
#   3 + stdout  Ask rule -> rewrite but prompt user
#
# Graceful degradation: if `rtk` is not found, exits 1 silently.
# Only emits stderr warnings when RTK is detected as available but
# the rewrite call genuinely fails for unexpected reasons.

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

# Skip heredocs
if ($cmd -match '<<') { exit 1 }

# Check if rtk is available
$rtkPath = (Get-Command rtk -ErrorAction SilentlyContinue).Source
if (-not $rtkPath) {
    # RTK not installed — silent pass-through
    exit 1
}

# Call rtk rewrite
try {
    $rewritten = & rtk rewrite $cmd 2>$null
    $exitCode = $LASTEXITCODE
} catch {
    exit 1
}

switch ($exitCode) {
    0 {
        if ($cmd -eq $rewritten) { exit 1 }
    }
    1 { exit 1 }
    2 { exit 1 }
    3 { }
    default { exit 1 }
}

# Build updated tool_input
$updatedInput = $data.tool_input | ConvertTo-Json -Compress
$updated = ($updatedInput | ConvertFrom-Json)
$updated.command = $rewritten

if ($exitCode -eq 3) {
    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            updatedInput = $updated
        }
    } | ConvertTo-Json -Compress
} else {
    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            permissionDecision = 'allow'
            permissionDecisionReason = 'RTK auto-rewrite'
            updatedInput = $updated
        }
    } | ConvertTo-Json -Compress
}

Write-Output $output
exit 0
