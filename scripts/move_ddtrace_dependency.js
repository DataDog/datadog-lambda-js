// Moves the dd-trace dependency from devDependencies to dependencies within package.json.
// This is used when building the Layer
//
// dd-trace is pinned to the version installed at runtime rather than the range in the
// manifest: install_deps.sh restores package.json to the v6 line after installing, so on Node
// 18/20 the range here still says v6 while node_modules holds v5.

// USAGE: ./move_ddtrace_dependency.js "$(cat package.json)" <resolved dd-trace version> > package.json

const file = JSON.parse(process.argv[2]);
const ddTraceVersion = process.argv[3];

if (!ddTraceVersion) {
  throw new Error('A resolved dd-trace version is required, e.g. $(node -p "require(\'dd-trace/package.json\').version")');
}

moveDependency('dd-trace', ddTraceVersion)
moveDependency('@datadog/native-appsec')
moveDependency('@datadog/pprof')
moveDependency('@opentelemetry/api')
moveDependency('@opentelemetry/api-logs')

console.log(JSON.stringify(file, null, 2));

function moveDependency (name, resolvedVersion) {
  const declaredVersion = file.devDependencies[name];
  delete file.devDependencies[name];
  file.dependencies[name] = resolvedVersion || declaredVersion;
}
