const fs = require('fs')
const path = require('path')
const process = require('process')
const { spawnSync } = require('child_process')

module.exports = function inlineWorker(entry) {
  entry = path.resolve(entry)
  let dir = path.dirname(entry)
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`No package.json found for ${entry}`)
    dir = parent
  }

  const {
    dependencies = {},
    imports,
    repository,
    version
  } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const url = typeof repository === 'string' ? repository : repository?.url
  if (typeof url !== 'string' || !url || typeof version !== 'string' || !version) {
    throw new Error('Worker package must define a repository URL and version')
  }
  const header = `// ${url.replace(/^git\+/, '').replace(/\.git$/, '')} v`
  const root = process.cwd()
  const worker = path.join(root, 'workers', 'main.js')
  try {
    if (!fs.readFileSync(worker, 'utf8').split(/\r?\n/, 1)[0].startsWith(header)) {
      throw new Error(`Refusing to overwrite ${worker}: missing or mismatched source header`)
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const source = `${header}${version}\n\n${fs.readFileSync(entry, 'utf8')}`
  const packages = Object.entries(dependencies).map(([name, range]) => {
    if (range.startsWith('file:')) range = `file:${path.resolve(dir, range.slice(5))}`
    return `${name}@${range}`
  })
  if (packages.length) {
    const { npm_node_execpath: node, npm_execpath: npm } = process.env
    if (!node || !npm) throw new Error('Run inline-worker-module through npm run')
    const result = spawnSync(node, [npm, 'install', '--save-prod', ...packages], {
      cwd: root,
      stdio: 'inherit'
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`npm install failed: ${result.signal || result.status}`)
    }
  }

  if (imports) {
    const file = path.join(root, 'package.json')
    const app = JSON.parse(fs.readFileSync(file, 'utf8'))
    app.imports = { ...imports, ...app.imports }
    fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n')
  }

  fs.mkdirSync(path.dirname(worker), { recursive: true })
  fs.writeFileSync(worker, source)
}
