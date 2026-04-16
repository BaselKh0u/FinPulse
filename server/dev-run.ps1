$ErrorActionPreference = "Stop"

$port = 5179
$project = Join-Path $PSScriptRoot "Server.csproj"

Write-Host "Checking for existing process on port $port..."
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $conn) {
    $owningPid = $conn.OwningProcess
    try {
        $proc = Get-Process -Id $owningPid -ErrorAction Stop
        Write-Host "Stopping existing process: $($proc.ProcessName) ($owningPid)"
        Stop-Process -Id $owningPid -Force
        Start-Sleep -Milliseconds 500
    }
    catch {
        Write-Warning "Found PID $owningPid on port $port, but failed to stop it automatically."
        throw
    }
}
else {
    Write-Host "No running process found on port $port."
}

Write-Host "Building server..."
dotnet build $project
if ($LASTEXITCODE -ne 0) {
    throw "Build failed."
}

Write-Host "Starting server..."
dotnet run --project $project
