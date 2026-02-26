// Moves the dd-trace dependency from devDependencies to dependencies within package.json.
// This is used when building the Layer

// USAGE: ./move_dd_trace_dependency.js "$(cat package.json)" > package.json

const file = JSON.parse(process.argv[2]);

moveDependency('dd-trace')
moveDependency('@datadog/pprof')
moveDependency('@opentelemetry/api')
moveDependency('@opentelemetry/api-logs')

console.log(JSON.stringify(file, null, 2));

function moveDependency (name) {
  const ddTraceVersion = file.devDependencies[name];
  delete file.devDependencies[name];
  file.dependencies[name] = ddTraceVersion;
}
