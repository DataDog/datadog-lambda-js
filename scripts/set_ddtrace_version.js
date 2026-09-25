// Pins the dd-trace devDependency to an explicit version within package.json.
// This is used to force the v5 line on runtimes that dd-trace v6 doesn't support.

// USAGE: ./set_ddtrace_version.js "$(cat package.json)" 5.123.0 > package.json

const file = JSON.parse(process.argv[2]);
const version = process.argv[3];

if (!version) {
  throw new Error("A dd-trace version is required");
}

file.devDependencies["dd-trace"] = version;

console.log(JSON.stringify(file, null, 2));
