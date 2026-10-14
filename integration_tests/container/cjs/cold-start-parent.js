require("./cold-start-probe");
require("./cold-start-skip");
process.stdout.write(JSON.stringify({ coldStartFixture: __filename }) + "\n");
