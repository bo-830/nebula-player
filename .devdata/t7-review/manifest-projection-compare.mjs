// Reviewer §20 probe (read-only): project the asar's embedded package.json against the recovered repo file.
// Rationale: electron-builder's fileTransformer.modifyMainPackageJson() rebuilds the asar manifest from the
// source package.json with JSON.stringify(data, null, 2) after deleting ONLY { scripts, keywords,
// devDependencies, ignoredPackageMetadataProperties, _* }. So the asar manifest is a near-lossless
// projection of the pre-accident repo package.json. This script quantifies exactly what that projection
// pins and what it does not.
import { openSync, readSync, closeSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [asarPath, repoPkgPath, lockPath] = process.argv.slice(2)

function asarEntry(fd, name) {
  const pre = Buffer.alloc(32)
  readSync(fd, pre, 0, 32, 0)
  const headerPickleSize = pre.readUInt32LE(4)
  const jsonLen = pre.readUInt32LE(12)
  const hdr = Buffer.alloc(jsonLen)
  readSync(fd, hdr, 0, jsonLen, 16)
  const header = JSON.parse(hdr.toString('utf8'))
  const e = header.files[name]
  const base = 8 + headerPickleSize
  const b = Buffer.alloc(e.size)
  readSync(fd, b, 0, e.size, base + Number(e.offset))
  return b
}

const fd = openSync(asarPath, 'r')
let asarBytes
try {
  asarBytes = asarEntry(fd, 'package.json')
} finally {
  closeSync(fd)
}
const asar = JSON.parse(asarBytes.toString('utf8'))
const repo = JSON.parse(readFileSync(repoPkgPath, 'utf8'))
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const lockRoot = lock.packages['']

const sha1 = (b) => createHash('sha1').update(b).digest('hex')
const asarKeys = Object.keys(asar)
const repoKeys = Object.keys(repo)
const shared = asarKeys.filter((k) => repoKeys.includes(k))

// byte comparison of the projected sub-object: asar manifest is JSON.stringify(data,null,2) output
const projection = {}
for (const k of shared) projection[k] = repo[k]
const projectionBytes = Buffer.from(JSON.stringify(projection, null, 2), 'utf8')

const valueDiffs = []
for (const k of shared) {
  const a = JSON.stringify(asar[k])
  const b = JSON.stringify(repo[k])
  if (a !== b) valueDiffs.push({ key: k, asar: a, repo: b })
}

const cmpMap = (a = {}, b = {}) => ({
  onlyAsar: Object.keys(a).filter((k) => !(k in b)),
  onlyRepo: Object.keys(b).filter((k) => !(k in a)),
  valueDiffs: Object.keys(a)
    .filter((k) => k in b && a[k] !== b[k])
    .map((k) => ({ key: k, asarOrLock: a[k], repo: b[k] }))
})

const report = {
  asarManifestSha1: sha1(asarBytes),
  asarManifestSize: asarBytes.length,
  asarManifestTrailingNewline: asarBytes[asarBytes.length - 1] === 0x0a,
  repoManifestSha1: sha1(readFileSync(repoPkgPath)),
  asarKeys,
  repoKeys,
  sharedKeys: shared,
  keysOnlyInRepo: repoKeys.filter((k) => !asarKeys.includes(k)),
  keysOnlyInAsar: asarKeys.filter((k) => !repoKeys.includes(k)),
  sharedValueDiffs: valueDiffs,
  projectedSubObjectSha1: sha1(projectionBytes),
  projectedSubObjectEqualsAsarManifest: projectionBytes.equals(asarBytes),
  dependencyComparison_vs_asar: cmpMap(asar.dependencies, repo.dependencies),
  dependencyComparison_vs_lockRoot: cmpMap(lockRoot.dependencies, repo.dependencies),
  devDependencyComparison_vs_lockRoot: cmpMap(lockRoot.devDependencies, repo.devDependencies),
  lockRootVersion: lockRoot.version,
  lockRootName: lockRoot.name,
  lockfileVersion: lock.lockfileVersion,
  repoScriptKeys: Object.keys(repo.scripts || {}),
  repoScriptCount: Object.keys(repo.scripts || {}).length,
  repoHasKeywords: 'keywords' in repo,
  repoHasLicense: 'license' in repo,
  repoHasPrivate: 'private' in repo,
  repoHasType: 'type' in repo,
  repoHasEngines: 'engines' in repo,
  repoHasBuild: 'build' in repo
}
console.log(JSON.stringify(report, null, 2))
