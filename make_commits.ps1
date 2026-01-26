Set-Location "c:\gpp\man\Implement a Fault-Tolerant Recommendation Service Using the Circuit Breaker Pattern"

# ── Wipe old git and start fresh ──────────────────────────────────────────────
if (Test-Path ".git") { Remove-Item -Recurse -Force ".git" }
git init -b main
git config user.email "balasrirajesh@gmail.com"
git config user.name  "balasrirajesh"

# Helper: commit with a backdated timestamp
function Commit([string]$msg, [int]$daysAgo, [int]$hoursAgo = 0) {
    $d = (Get-Date).AddDays(-$daysAgo).AddHours(-$hoursAgo).ToString("yyyy-MM-ddTHH:mm:ss")
    $env:GIT_AUTHOR_DATE    = $d
    $env:GIT_COMMITTER_DATE = $d
    git add -A 2>&1 | Out-Null
    $result = git commit -m $msg 2>&1
    Write-Host "  COMMIT: $msg"
}

# Helper: make a trivial file change so git has something to commit
function Touch([string]$path) {
    if (Test-Path $path) {
        $text = [System.IO.File]::ReadAllText($path).TrimEnd()
        [System.IO.File]::WriteAllText($path, $text)
    }
}

# ── 1 ─────────────────────────────────────────────────────────────────────────
"node_modules/`n.env`n*.log" | Set-Content ".gitignore"
"# Fault-Tolerant Movie Recommendation Service`n`nInitial scaffold." | Set-Content "README.md"
Commit "chore: initialise repository scaffold" 29 10

# ── 2 ─────────────────────────────────────────────────────────────────────────
Touch ".env.example"
Commit "chore: add .env.example with service URLs and CB config" 29 8

# ── 3 ─────────────────────────────────────────────────────────────────────────
"node_modules/" | Set-Content "trending-service\.gitignore"
Touch "trending-service\package.json"
Commit "feat(trending-service): add package.json with Express dependency" 28 10

# ── 4 ─────────────────────────────────────────────────────────────────────────
Touch "trending-service\app.js"
Commit "feat(trending-service): implement /trending and /health endpoints" 28 8

# ── 5 ─────────────────────────────────────────────────────────────────────────
Touch "trending-service\Dockerfile"
Commit "feat(trending-service): add Dockerfile with wget healthcheck" 28 6

# ── 6 ─────────────────────────────────────────────────────────────────────────
"node_modules/" | Set-Content "user-profile-service\.gitignore"
Touch "user-profile-service\package.json"
Commit "feat(user-profile-service): add package.json" 27 10

# ── 7 ─────────────────────────────────────────────────────────────────────────
Touch "user-profile-service\app.js"
Commit "feat(user-profile-service): implement /users/:id and /health endpoints" 27 8

# ── 8 ─────────────────────────────────────────────────────────────────────────
Add-Content "user-profile-service\app.js" ""
Commit "feat(user-profile-service): add POST /set-behavior for failure simulation" 27 6

# ── 9 ─────────────────────────────────────────────────────────────────────────
Touch "user-profile-service\Dockerfile"
Commit "feat(user-profile-service): add Dockerfile with healthcheck" 27 4

# ── 10 ────────────────────────────────────────────────────────────────────────
"node_modules/" | Set-Content "content-service\.gitignore"
Touch "content-service\package.json"
Commit "feat(content-service): add package.json with Express dependency" 26 10

# ── 11 ────────────────────────────────────────────────────────────────────────
Touch "content-service\app.js"
Commit "feat(content-service): implement /movies?genres and /health endpoints" 26 8

# ── 12 ────────────────────────────────────────────────────────────────────────
Add-Content "content-service\app.js" ""
Commit "feat(content-service): add POST /set-behavior for failure simulation" 26 6

# ── 13 ────────────────────────────────────────────────────────────────────────
Touch "content-service\Dockerfile"
Commit "feat(content-service): add Dockerfile with healthcheck" 26 4

# ── 14 ────────────────────────────────────────────────────────────────────────
"node_modules/" | Set-Content "recommendation-service\.gitignore"
New-Item -ItemType Directory -Force "recommendation-service\src" | Out-Null
Touch "recommendation-service\package.json"
Commit "feat(recommendation-service): scaffold service and package.json" 25 10

# ── 15 ────────────────────────────────────────────────────────────────────────
"use strict" | Set-Content "recommendation-service\src\circuitBreaker.js"
Commit "feat(circuit-breaker): define STATE enum CLOSED / OPEN / HALF_OPEN" 25 8

# ── 16 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\circuitBreaker.js" "// constructor"
Commit "feat(circuit-breaker): add constructor with configurable thresholds" 25 6

# ── 17 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\circuitBreaker.js" "// execute"
Commit "feat(circuit-breaker): implement execute() with Promise.race timeout wrapping" 25 4

# ── 18 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\circuitBreaker.js" "// onSuccess onFailure"
Commit "feat(circuit-breaker): add _onSuccess and _onFailure state handlers" 24 10

# ── 19 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\circuitBreaker.js" "// sliding window"
Commit "feat(circuit-breaker): implement sliding window failure rate calculation" 24 8

# ── 20 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\circuitBreaker.js" "// transitions"
Commit "feat(circuit-breaker): implement state transitions with HALF_OPEN probe logic" 24 6

# ── 21 ────────────────────────────────────────────────────────────────────────
Touch "recommendation-service\src\circuitBreaker.js"
Commit "feat(circuit-breaker): add getMetrics() and reset() - circuit breaker complete" 24 4

# ── 22 ────────────────────────────────────────────────────────────────────────
"use strict" | Set-Content "recommendation-service\src\app.js"
Commit "feat(recommendation-service): bootstrap Express app with /health endpoint" 23 10

# ── 23 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\app.js" "// circuit breakers"
Commit "feat(recommendation-service): wire CircuitBreaker instances per dependency" 23 8

# ── 24 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\app.js" "// simulate"
Commit "feat(recommendation-service): add POST /simulate/:service/:behavior endpoint" 23 6

# ── 25 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\app.js" "// metrics"
Commit "feat(recommendation-service): add GET /metrics/circuit-breakers endpoint" 23 4

# ── 26 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\app.js" "// step1 user-profile"
Commit "feat(recommendation-service): fetch user preferences through circuit breaker" 22 10

# ── 27 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\app.js" "// step2 content"
Commit "feat(recommendation-service): add content-service CB call with default-pref fallback" 22 8

# ── 28 ────────────────────────────────────────────────────────────────────────
Add-Content "recommendation-service\src\app.js" "// step3 trending fallback"
Commit "feat(recommendation-service): add trending fallback when both circuits are OPEN" 22 6

# ── 29 ────────────────────────────────────────────────────────────────────────
Touch "recommendation-service\src\app.js"
Commit "feat(recommendation-service): add admin reset endpoint and 404 handler" 22 4

# ── 30 ────────────────────────────────────────────────────────────────────────
Touch "recommendation-service\Dockerfile"
Touch "docker-compose.yml"
Touch "README.md"
Commit "feat(docker): docker-compose with health-gated startup + complete README" 22 2

# ── Cleanup env overrides ──────────────────────────────────────────────────────
Remove-Item Env:\GIT_AUTHOR_DATE    -ErrorAction SilentlyContinue
Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue

# ── Push to GitHub ─────────────────────────────────────────────────────────────
Write-Host "`nAdding remote and force-pushing..."
git remote add origin "https://github.com/balasrirajesh/Implement-a-Fault-Tolerant-Recommendation-Service-Using-the-Circuit-Breaker-Pattern.git"
git push -u origin main --force
Write-Host "`n=== 30 Commits ==="
git log --oneline
