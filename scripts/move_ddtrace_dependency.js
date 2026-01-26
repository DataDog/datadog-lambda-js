// Moves the dd-trace dependency from devDependencies to dependencies within package.json.
// This is used when building the Layer

// USAGE: ./move_dd_trace_dependency.js "$(cat package.json)" > package.json

moveDependency('dd-trace')
moveDependency('@datadog/pprof')

function moveDependency (name) {
  const file = JSON.parse(process.argv[2]);
  const ddTraceVersion = file.devDependencies[name];
  delete file.devDependencies[name];
  file.dependencies[name] = ddTraceVersion;
  console.log(JSON.stringify(file, null, 2));
}