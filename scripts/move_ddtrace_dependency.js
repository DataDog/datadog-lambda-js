// Moves the dd-trace dependency from devDependencies to dependencies within package.json.
// Also promotes selected dd-trace optionalDependencies to direct dependencies so they
// survive `yarn install --production=true --ignore-optional`.
// This is used when building the Layer

// USAGE: ./move_dd_trace_dependency.js "$(cat package.json)" > package.json

const file = JSON.parse(process.argv[2]);

moveDependency('dd-trace')
moveDependency('@datadog/pprof')
moveDependency('@opentelemetry/api')
moveDependency('@opentelemetry/api-logs')

addOptionalFromDdTrace('@datadog/native-appsec')

console.log(JSON.stringify(file, null, 2));

function moveDependency (name) {
  const ddTraceVersion = file.devDependencies[name];
  delete file.devDependencies[name];
  file.dependencies[name] = ddTraceVersion;
}

function addOptionalFromDdTrace (name) {
  try {
    const ddTracePkg = require('dd-trace/package.json')
    const version = ddTracePkg.optionalDependencies?.[name]
    if (version) {
      file.dependencies[name] = version
    }
  } catch {
    // dd-trace not installed yet; skip
  }
}

