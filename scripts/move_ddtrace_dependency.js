// Moves the dd-trace dependency from devDependencies to dependencies within package.json.
// This is used when building the Layer
//
// dd-trace is pinned to the version installed at runtime rather than the range in the
// manifest: install_deps.sh restores package.json to the v6 line after installing, so on Node
// 18/20 the range here still says v6 while node_modules holds v5.
//
// The layer is installed with --ignore-optional, which drops dd-trace's native addons, so they
// are added back at the exact versions that dd-trace declares. Pinning them in our own
// devDependencies instead let them drift from the versions dd-trace calls into, e.g. dd-trace
// passing heapLimitExtensionSize 'auto' to a @datadog/pprof too old to accept it.

// USAGE: ./move_ddtrace_dependency.js "$(cat package.json)" "$(cat node_modules/dd-trace/package.json)" > package.json

const file = JSON.parse(process.argv[2]);

if (!process.argv[3]) {
  throw new Error('The installed dd-trace package.json is required, e.g. "$(cat node_modules/dd-trace/package.json)"');
}
const ddTracePackage = JSON.parse(process.argv[3]);

moveDependency('dd-trace', ddTracePackage.version)
moveDependency('@datadog/native-appsec', ddTraceOptionalVersion('@datadog/native-appsec'))
moveDependency('@datadog/pprof', ddTraceOptionalVersion('@datadog/pprof'))
moveDependency('@opentelemetry/api')
moveDependency('@opentelemetry/api-logs')

console.log(JSON.stringify(file, null, 2));

function moveDependency (name, resolvedVersion) {
  const declaredVersion = file.devDependencies[name];
  delete file.devDependencies[name];
  file.dependencies[name] = resolvedVersion || declaredVersion;
}

function ddTraceOptionalVersion (name) {
  const version = ddTracePackage.optionalDependencies[name];
  if (!version) {
    throw new Error(`dd-trace ${ddTracePackage.version} does not declare ${name} in optionalDependencies`);
  }
  return version;
}
