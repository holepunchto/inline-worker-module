const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-worker-module-'))
const repository = 'https://github.com/example/worker-fixture'
const metadata = require('./package.json')
const env = {
  ...process.env,
  npm_config_offline: 'true',
  npm_config_ignore_scripts: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false'
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n')
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function npm(args, cwd, success = true) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...args],
    { cwd, env, encoding: 'utf8' }
  )
  if (result.error) throw result.error
  if (success) assert.equal(result.status, 0, result.stdout + result.stderr)
  else assert.notEqual(result.status, 0)
  return result
}

function test(runtime) {
  const dir = path.join(root, runtime)
  const app = path.join(dir, 'app')
  const source = path.join(dir, 'packages', 'source')
  const dependency = path.join(dir, 'packages', 'runtime')
  const worker = path.join(app, 'workers', 'main.js')
  const manifest = path.join(app, 'package.json')
  const lockfile = path.join(app, 'package-lock.json')
  const body = "module.exports = require('runtime-fixture')\n"
  const sourceName = `@worker-fixtures/source-${runtime}`
  const cli =
    runtime === 'bare' ? 'inline-worker-module' : 'node node_modules/inline-worker-module/bin.js'
  const imports = { shared: 'source-value', 'source-alias': 'source-value' }
  const appImports = { shared: 'app-value', 'app-alias': 'app-value' }
  const sourcePackage = {
    name: sourceName,
    version: '1.0.0',
    main: 'lib/worker.js',
    repository: { url: `git+${repository}.git` },
    dependencies: { 'runtime-fixture': 'file:../runtime' },
    imports
  }

  write(path.join(dependency, 'package.json'), {
    name: 'runtime-fixture',
    version: '1.0.0',
    main: 'index.js'
  })
  write(path.join(dependency, 'index.js'), "module.exports = 'runtime'\n")
  write(path.join(source, 'package.json'), sourcePackage)
  write(path.join(source, 'lib', 'worker.js'), body)
  write(manifest, {
    name: `app-${runtime}`,
    version: '1.0.0',
    scripts: { 'inline-worker-module': `${runtime} inline.js`, 'inline-cli': cli },
    devDependencies: {
      'inline-worker-module': `file:${__dirname}`,
      [sourceName]: `file:${source}`
    },
    imports: appImports
  })
  write(
    path.join(app, 'inline.js'),
    `require('inline-worker-module')(require.resolve('${sourceName}'))\n`
  )

  npm(['install', '--include=dev'], app)
  assert.equal(fs.existsSync(path.join(app, 'node_modules', '.bin', 'inline-worker-module')), true)
  assert.equal(fs.existsSync(worker), false)
  delete sourcePackage.repository
  write(path.join(source, 'package.json'), sourcePackage)
  const missingRepository = npm(['run', 'inline-worker-module'], app, false)
  assert.match(missingRepository.stderr, /repository URL/)
  assert.equal(fs.existsSync(worker), false)
  assert.deepEqual(read(manifest).imports, appImports)
  sourcePackage.repository = { url: `git+${repository}.git` }
  write(path.join(source, 'package.json'), sourcePackage)
  npm(['run', 'inline-worker-module'], app)
  assert.equal(fs.readFileSync(worker, 'utf8'), `// ${repository} v1.0.0\n\n${body}`)
  assert.deepEqual(read(manifest).imports, { ...imports, ...appImports })
  assert.deepEqual(Object.keys(read(manifest).dependencies), ['runtime-fixture'])
  assert.deepEqual(Object.keys(read(lockfile).packages[''].dependencies), ['runtime-fixture'])
  assert.deepEqual(Object.keys(read(manifest).devDependencies), [
    sourceName,
    'inline-worker-module'
  ])

  const original = [worker, manifest, lockfile].map((file) => fs.readFileSync(file, 'utf8'))
  for (const args of [[], ['--help'], ['@worker-fixtures/missing'], [sourceName, 'extra']]) {
    const help = args[0] === '--help'
    const result = npm(['run', 'inline-cli', '--', ...args], app, help)
    if (help) assert.match(result.stdout, /inline-worker-module/)
    assert.doesNotMatch(result.stdout, /Inlined /)
    assert.deepEqual(
      [worker, manifest, lockfile].map((file) => fs.readFileSync(file, 'utf8')),
      original
    )
  }

  sourcePackage.version = '2.0.0'
  sourcePackage.repository = `git+${repository}.git`
  const updated = "module.exports = require('runtime-fixture') + ' updated'\n"
  write(path.join(source, 'package.json'), sourcePackage)
  write(path.join(source, 'lib', 'worker.js'), updated)
  const inlined = npm(['run', 'inline-cli', '--', sourceName], app)
  assert.ok(inlined.stdout.includes(`Inlined ${sourceName} into workers/main.js`))
  const generated = `// ${repository} v2.0.0\n\n${updated}`
  assert.equal(fs.readFileSync(worker, 'utf8'), generated)

  const production = path.join(dir, 'production')
  write(path.join(production, 'package.json'), fs.readFileSync(manifest, 'utf8'))
  write(path.join(production, 'package-lock.json'), fs.readFileSync(lockfile, 'utf8'))
  write(path.join(production, 'workers', 'main.js'), generated)
  npm(['ci', '--omit=dev'], production)
  assert.equal(fs.existsSync(path.join(production, 'node_modules', 'inline-worker-module')), false)
  assert.equal(fs.existsSync(path.join(production, 'node_modules', sourceName)), false)
  assert.equal(require(path.join(production, 'workers', 'main.js')), 'runtime updated')

  sourcePackage.dependencies['runtime-fixture'] = `file:${path.join(dir, 'missing.tgz')}`
  sourcePackage.imports.failed = 'must-not-be-applied'
  write(path.join(source, 'package.json'), sourcePackage)
  write(path.join(source, 'lib', 'worker.js'), 'module.exports = false\n')
  const before = fs.readFileSync(manifest, 'utf8')
  const lockBefore = fs.readFileSync(lockfile, 'utf8')
  npm(['run', 'inline-worker-module'], app, false)
  const failed = npm(['run', 'inline-cli', '--', sourceName], app, false)
  assert.match(failed.stderr, /npm install failed/)
  assert.doesNotMatch(failed.stdout, /Inlined /)
  assert.equal(fs.readFileSync(worker, 'utf8'), generated)
  assert.equal(fs.readFileSync(manifest, 'utf8'), before)
  assert.equal(fs.readFileSync(lockfile, 'utf8'), lockBefore)

  for (const custom of [
    "module.exports = 'custom'\n",
    `// the boilerplate worker is available at ${repository}\nrequire('${sourceName}')\n`,
    `// https://github.com/example/other-worker v1.0.0\n${body}`
  ]) {
    write(worker, custom)
    const api = npm(['run', 'inline-worker-module'], app, false)
    const cli = npm(['run', 'inline-cli', '--', sourceName], app, false)
    for (const result of [api, cli]) {
      assert.match(result.stderr, /Refusing to overwrite .*missing or mismatched source header/)
      assert.doesNotMatch(result.stdout, /Inlined /)
    }
    assert.equal(fs.readFileSync(worker, 'utf8'), custom)
    assert.equal(fs.readFileSync(manifest, 'utf8'), before)
    assert.equal(fs.readFileSync(lockfile, 'utf8'), lockBefore)
  }
  console.log(`${runtime}: passed`)
}

try {
  assert.deepEqual(metadata.bin, { 'inline-worker-module': 'bin.js' })
  for (const script of ['preinstall', 'install', 'postinstall']) {
    assert.equal(metadata.scripts[script], undefined)
  }
  test('node')
  test('bare')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
