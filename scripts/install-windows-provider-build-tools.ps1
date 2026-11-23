$ErrorActionPreference = 'Stop'
$download = Join-Path $env:RUNNER_TEMP 'vs_BuildTools-17.14.36.exe'
$installPath = Join-Path $env:RUNNER_TEMP 'ling-vs-buildtools'
$sha256 = '5ae95bb02bb3442441a8d891e5bb1d2975445e2e3ee16ada5bc7bd17227f1dd7'
$url = "https://download.visualstudio.microsoft.com/download/pr/12aa1305-dd17-4f26-8429-d072cda64c80/$sha256/vs_BuildTools.exe"
Invoke-WebRequest -Uri $url -OutFile $download
$signature = Get-AuthenticodeSignature -LiteralPath $download
$observedSha256 = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant()
if ($observedSha256 -ne $sha256 -or $signature.Status -ne 'Valid' -or
    $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation(?:,|$)') {
  throw 'Visual Studio Build Tools installer identity does not match the pinned Microsoft release.'
}
$quotedPath = '"' + $installPath + '"'
$process = Start-Process -FilePath $download -Wait -PassThru -ArgumentList @(
  '--quiet', '--wait', '--norestart', '--nocache', '--installPath', $quotedPath,
  '--add', 'Microsoft.VisualStudio.Workload.VCTools',
  '--add', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
  '--add', 'Microsoft.VisualStudio.Component.VC.14.44.17.14.x86.x64.Spectre',
  '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.26100'
)
if ($process.ExitCode -notin @(0, 3010)) { throw "Visual Studio Build Tools install returned $($process.ExitCode)." }
