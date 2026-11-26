$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ("ling-release-catalog-" + [Guid]::NewGuid())
$payload = Join-Path $root 'payload'
$complete = Join-Path $root 'complete.cat'
$missingSeal = Join-Path $root 'missing-seal.cat'
$seal = Join-Path $payload 'provider-seal.json'

try {
  [IO.Directory]::CreateDirectory($payload) | Out-Null
  [IO.File]::Copy((Join-Path $env:SystemRoot 'System32/where.exe'), (Join-Path $payload 'ling-cua-driver.exe'))
  New-FileCatalog -Path $payload -CatalogFilePath $missingSeal -CatalogVersion 2.0 | Out-Null
  [IO.File]::WriteAllText($seal, '{}')
  New-FileCatalog -Path $payload -CatalogFilePath $complete -CatalogVersion 2.0 | Out-Null

  $check = @'
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { verifyWindowsReleaseCatalog } from './scripts/verify-windows-release-catalog.mjs';

const [complete, missingSeal, payload, seal] = process.argv.slice(1);
verifyWindowsReleaseCatalog(complete, payload);
assert.throws(() => verifyWindowsReleaseCatalog(missingSeal, payload), /staged provider executable and seal/);
await writeFile(seal, 'changed seal');
assert.throws(() => verifyWindowsReleaseCatalog(complete, payload), /staged provider executable and seal/);
console.log('Windows catalog verified: exact payload accepted, missing and modified seals rejected');
'@
  node --input-type=module -e $check $complete $missingSeal $payload $seal
  if ($LASTEXITCODE -ne 0) { throw 'Windows release catalog check failed.' }
}
finally {
  if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
