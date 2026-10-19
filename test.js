const test = require('brittle')
const fs = require('fs')
const path = require('path')
const process = require('process')
const inlineWorker = require('./')

async function setup(t) {
  const dir = await t.tmp()
  const cwd = process.cwd()
  t.teardown(() => process.chdir(cwd), { force: true })
  process.chdir(dir)

  const write = (file, value) =>
    fs.writeFileSync(
      path.join(dir, file),
      typeof value === 'string' ? value : JSON.stringify(value)
    )
  const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8')
  const source = {
    name: 'worker',
    version: '1.0.0',
    repository: 'https://github.com/example/worker',
    dependencies: { paparam: '^1.13.0' },
    imports: { shared: 'app', worker: 'main' }
  }
  fs.mkdirSync(path.join(dir, 'source'))
  write('source/package.json', source)
  write('source/index.js', 'module.exports = 1\n')
  write('package.json', { name: 'app', version: '1.0.0', imports: { shared: 'app' } })
  write('.npmrc', 'offline=true\nignore-scripts=true\naudit=false\nfund=false\nloglevel=silent\n')
  const entry = path.join(dir, 'source', 'index.js')
  return { entry, source, write, read }
}

test('inline a worker at the default target', async (t) => {
  const { entry, read } = await setup(t)
  inlineWorker(entry)
  t.ok(fs.existsSync('workers/main.js'))
  t.ok(fs.existsSync('node_modules/paparam/index.js'))
  t.ok(JSON.parse(read('package.json')).dependencies.paparam)
  t.alike(JSON.parse(read('package.json')).imports, { shared: 'app', worker: 'main' })
})

test('update an existing worker', async (t) => {
  const { entry, source, write, read } = await setup(t)
  inlineWorker(entry)
  t.is(read('workers/main.js'), `// ${source.repository} v1.0.0\n\nmodule.exports = 1\n`)

  source.version = '2.0.0'
  write('source/package.json', source)
  write('source/index.js', 'module.exports = 2\n')
  inlineWorker(entry)
  t.is(read('workers/main.js'), `// ${source.repository} v2.0.0\n\nmodule.exports = 2\n`)
})

test('preserve the worker when dependency installation fails', async (t) => {
  const { entry, source, write, read } = await setup(t)
  inlineWorker(entry)
  const original = read('workers/main.js')

  source.version = '2.0.0'
  source.dependencies.paparam = '9999.0.0'
  write('source/package.json', source)
  write('source/index.js', 'module.exports = 2\n')
  await t.exception(() => inlineWorker(entry), /npm install failed/)
  t.is(read('workers/main.js'), original)
})

test('inline a worker at a custom target', async (t) => {
  const { entry, source, read } = await setup(t)
  inlineWorker(entry, './nested/worker.js')
  t.is(read('nested/worker.js'), `// ${source.repository} v1.0.0\n\nmodule.exports = 1\n`)
  t.absent(fs.existsSync('workers/main.js'))
})

test('refuse to overwrite a protected target', async (t) => {
  const { entry, write, read } = await setup(t)
  fs.mkdirSync('workers')
  write('workers/main.js', 'module.exports = 3\n')
  await t.exception(() => inlineWorker(entry), /Refusing to overwrite/)
  t.is(read('workers/main.js'), 'module.exports = 3\n')
})
