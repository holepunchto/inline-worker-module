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

Run `inline-worker-module --help` to view the command's arguments.

The CLI logs success after inlining finishes. Failures print an error and exit with a nonzero status.

Commit `workers/main.js`, `package.json`, and `package-lock.json` together. After updating the worker package, run the command again and commit the refreshed files. App users receive the committed worker and runtime dependencies; they need no setup command or install hook.

## API

The library API supports Bare and Node.js:

```js
require('inline-worker-module')(require.resolve('hello-pear-worker'))
```

### `inlineWorker(entry)`

`entry` is the absolute path to the source package's worker entrypoint, typically obtained with `require.resolve(...)`. The nearest enclosing `package.json` supplies its metadata and must define a repository URL and version. The repository may be a URL string or an object with a `url` field. The app is the current working directory.

The helper writes `workers/main.js` with a first comment containing the source repository URL and package version. It replaces a missing or provenance-marked worker and throws if an existing worker lacks a matching source comment. Remove the first comment before customizing the worker to protect your changes. To replace a protected worker intentionally, move it aside before running the command.

It installs the source package's runtime dependencies with npm and saves them to the app's `dependencies`. Relative `file:` dependencies resolve from the source package. It also merges the source package's `imports`, preserving mappings already defined by the app. Only the entrypoint is copied; it must not depend on uncopied relative files.

When the source package has runtime dependencies, run through an npm script so the helper can invoke npm using its supplied environment. Neither the helper nor the worker source package needs to be installed in production.

## Scripts

- `npm test` - run lint and integration tests under Bare and Node.js
- `npm run lint` - check formatting with prettier and lint with lunte
- `npm run format` - format the repository with prettier

## License

Apache-2.0
