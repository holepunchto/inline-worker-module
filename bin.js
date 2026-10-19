#!/usr/bin/env bare

const path = require('path')
const process = require('process')
const { createRequire } = require('module')
const { command, arg, summary } = require('paparam')
const inlineWorker = require('./')
const { name, description } = require('./package.json')

const cmd = command(name, summary(description), arg('<module>', 'Worker package to inline'))

try {
  if (cmd.parse(process.argv.slice(2), { sync: true })) {
    const resolve = createRequire(path.join(process.cwd(), 'package.json')).resolve
    inlineWorker(resolve(cmd.args.module))
    console.log(`Inlined ${cmd.args.module} into workers/main.js`)
  }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
}
