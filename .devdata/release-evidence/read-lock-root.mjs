/** t43 事故恢复：从 package-lock.json 的根条目读取原始 manifest 字段（PS 的 ConvertFrom-Json 解析该文件失败）。 */
import { readFileSync } from 'fs'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const root = lock.packages?.[''] ?? {}
console.log('lockfileVersion =', lock.lockfileVersion)
console.log('lock.name =', lock.name, '| lock.version =', lock.version)
console.log('--- root entry (packages[""]) ---')
console.log(JSON.stringify(root, null, 2))
