# inline-worker-module

Copy a package's worker entrypoint into an app with its runtime dependencies and import mappings. Supports Bare and Node.js.

## Usage

Install the helper and worker source as development dependencies:

```sh
npm install --save-dev inline-worker-module hello-pear-worker
```

Add a maintainer command to the app's `package.json`:

```json
{
  "scripts": {
    "inline-worker-module": "inline-worker-module hello-pear-worker"
  }
}
```

The command runs with Bare. Replace `hello-pear-worker` with any installed worker package name, including scoped packages. The worker is resolved from the app's current working directory. Invoke the command explicitly:

```sh
npm run inline-worker-module
```

`inline-worker-module <module> [target]` writes to `workers/main.js` by default. Use `--help` for arguments.

The CLI logs success after inlining finishes. Failures print an error and exit with a nonzero status.

Commit `workers/main.js`, `package.json`, and `package-lock.json` together. After updating the worker package, run the command again and commit the refreshed files. App users receive the committed worker and runtime dependencies; they need no setup command or install hook.

## API

The library API supports Bare and Node.js:

```js
require('inline-worker-module')(require.resolve('hello-pear-worker'))
```

### `inlineWorker(entry, target = 'workers/main.js')`

Copies the resolved `entry` to the app-relative `target`, installs runtime dependencies, and merges imports. The source package needs a repository URL and version. Run via `npm run`.

Existing workers need a matching source header. Remove it before editing to prevent replacement.

## Scripts

- `npm test` - run lint and integration tests under Bare and Node.js
- `npm run test:node` - run tests with `brittle-node`
- `npm run test:bare` - run tests with `brittle-bare`
- `npm run lint` - check formatting with prettier and lint with lunte
- `npm run format` - format the repository with prettier

## License

Apache-2.0
