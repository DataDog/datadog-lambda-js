// Moves the dd-trace dependency from devDependencies to dependencies within package.json.
// This is used when building the Layer

// USAGE: ./move_dd_trace_dependency.js "$(cat package.json)" > package.json

const file = JSON.parse(process.argv[2]);
const ddTraceVersion = file.devDependencies["dd-trace"];
delete file.devDependencies["dd-trace"];
file.dependencies["dd-trace"] = ddTraceVersion;
console.log(JSON.stringify(file, null, 2));
