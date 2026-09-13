# t47 discriminative experiment: copy + independent vitest config (src/** untouched).
# For each module: control (expect pass) -> mutate the copy (expect FAIL) -> restore (expect pass, hash identical)
# NOTE: no non-ASCII literals in this file — Windows PowerShell 5.1 decodes BOM-less
# .ps1 as ANSI, which mangles the CJK workspace path. $PSScriptRoot comes from the OS.
$here = $PSScriptRoot
$root = (Resolve-Path (Join-Path $here '..\..')).Path
$base = Join-Path $root '.devdata\t47-evidence\discrim'
$mbDir = Join-Path $base 'minibounds'
$cpDir = Join-Path $base 'chatproxy'
New-Item -ItemType Directory -Force -Path $mbDir, $cpDir | Out-Null

$utf8 = New-Object System.Text.UTF8Encoding($false)
function ReadText($p) { [System.IO.File]::ReadAllText($p) }
function WriteText($p, $t) { [System.IO.File]::WriteAllText($p, $t, $utf8) }
function Src($rel) { Join-Path $root $rel }
function Sha($p) { (Get-FileHash $p -Algorithm SHA1).Hash }
function StageFile($src, $dst, $from, $to) {
  $text = ReadText $src
  if ($from) { $text = $text -replace [regex]::Escape($from), $to }
  WriteText $dst $text
}

# ---------- stage the copies ----------
StageFile (Src 'src\main\miniBounds.ts') (Join-Path $mbDir 'miniBounds.ts') $null $null
StageFile (Src 'src\main\miniBounds.ts') (Join-Path $mbDir 'miniBounds.pristine.ts') $null $null
StageFile (Src 'src\main\__tests__\miniBounds.test.ts') (Join-Path $mbDir 'miniBounds.test.ts') '../miniBounds' './miniBounds'

StageFile (Src 'src\renderer\src\lib\chatProxy.ts') (Join-Path $cpDir 'chatProxy.ts') '../../../shared/types' '../../../../src/shared/types'
StageFile (Src 'src\renderer\src\lib\chatProxy.ts') (Join-Path $cpDir 'chatProxy.pristine.ts') '../../../shared/types' '../../../../src/shared/types'
StageFile (Src 'src\renderer\src\lib\__tests__\chatProxy.test.ts') (Join-Path $cpDir 'chatProxy.test.ts') '../chatProxy' './chatProxy'

WriteText (Join-Path $mbDir 'vitest.config.ts') @'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['.devdata/t47-evidence/discrim/minibounds/**/*.test.ts'], environment: 'node' }
})
'@
WriteText (Join-Path $cpDir 'vitest.config.ts') @'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['.devdata/t47-evidence/discrim/chatproxy/**/*.test.ts'], environment: 'node' }
})
'@

function RunVitest($cfg) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = (& npx.cmd vitest run --config $cfg 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  $lines = ($out -split "`n" | Where-Object { $_ -match 'Test Files|^\s*Tests\s|failed|passed' } | ForEach-Object { $_.Trim() } | Select-Object -First 6) -join ' || '
  return [ordered]@{ exitCode = $code; summary = $lines }
}

$result = [ordered]@{}

# ---------- miniBounds: clamping removed ----------
$result.miniBounds = [ordered]@{}
$result.miniBounds.shaPristine = Sha (Join-Path $mbDir 'miniBounds.pristine.ts')
$result.miniBounds.control = RunVitest '.devdata/t47-evidence/discrim/minibounds/vitest.config.ts'

$mb = Join-Path $mbDir 'miniBounds.ts'
$text = ReadText $mb
$text = $text.Replace('const width = Math.min(target.width, workArea.width)', 'const width = target.width')
$text = $text.Replace('const height = Math.min(target.height, workArea.height)', 'const height = target.height')
$text = $text.Replace('x: Math.min(Math.max(current.x, workArea.x), maxX),', 'x: current.x,')
$text = $text.Replace('y: Math.min(Math.max(current.y, workArea.y), maxY),', 'y: current.y,')
WriteText $mb $text
$result.miniBounds.shaMutated = Sha $mb
$result.miniBounds.mutated = RunVitest '.devdata/t47-evidence/discrim/minibounds/vitest.config.ts'

Copy-Item (Join-Path $mbDir 'miniBounds.pristine.ts') $mb -Force
$result.miniBounds.shaRestored = Sha $mb
$result.miniBounds.restoredIdentical = ($result.miniBounds.shaPristine -eq $result.miniBounds.shaRestored)
$result.miniBounds.restored = RunVitest '.devdata/t47-evidence/discrim/minibounds/vitest.config.ts'

# ---------- chatProxy: caps removed ----------
$result.chatProxy = [ordered]@{}
$result.chatProxy.shaPristine = Sha (Join-Path $cpDir 'chatProxy.pristine.ts')
$result.chatProxy.control = RunVitest '.devdata/t47-evidence/discrim/chatproxy/vitest.config.ts'

$cp = Join-Path $cpDir 'chatProxy.ts'
$text = ReadText $cp
$before = $text.Length
$text = $text.Replace('return value.length > limit ? `${value.slice(0, limit)}…` : value', 'return value')
$text = $text.Replace('bubbles: bubbles.slice(-bubbleLimit).map', 'bubbles: bubbles.slice().map')
WriteText $cp $text
$result.chatProxy.mutationApplied = ($text.Length -ne $before)
$result.chatProxy.shaMutated = Sha $cp
$result.chatProxy.mutated = RunVitest '.devdata/t47-evidence/discrim/chatproxy/vitest.config.ts'

Copy-Item (Join-Path $cpDir 'chatProxy.pristine.ts') $cp -Force
$result.chatProxy.shaRestored = Sha $cp
$result.chatProxy.restoredIdentical = ($result.chatProxy.shaPristine -eq $result.chatProxy.shaRestored)
$result.chatProxy.restored = RunVitest '.devdata/t47-evidence/discrim/chatproxy/vitest.config.ts'

# src/** must be untouched by all of this
$result.srcKeyFiles = [ordered]@{
  miniBounds = Sha (Src 'src\main\miniBounds.ts')
  chatProxy  = Sha (Src 'src\renderer\src\lib\chatProxy.ts')
}

$json = $result | ConvertTo-Json -Depth 6
WriteText (Join-Path $root '.devdata\t47-evidence\discrim.json') $json
$json
