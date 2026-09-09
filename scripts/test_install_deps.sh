#!/bin/bash

# Regression test for install_deps.sh in reduced build contexts that do not
# include the repository's yarn.lock.

set -euo pipefail

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$scripts_dir")
test_repo=$(mktemp -d)

cleanup() {
    rm -rf "$test_repo"
}
trap cleanup EXIT

mkdir -p "$test_repo/scripts" "$test_repo/bin"
cp "$repo_dir/package.json" "$test_repo/package.json"
cp "$scripts_dir/dd_trace_versions.sh" "$test_repo/scripts/dd_trace_versions.sh"
cp "$scripts_dir/install_deps.sh" "$test_repo/scripts/install_deps.sh"
cp "$scripts_dir/set_ddtrace_version.js" "$test_repo/scripts/set_ddtrace_version.js"

# Avoid a network install while preserving Yarn's relevant behavior: verify
# the temporary v5 manifest and create the lockfile that a real install would.
cat > "$test_repo/bin/yarn" <<'EOF'
#!/bin/bash
set -euo pipefail

case " $* " in
    *" --ignore-engines "*) ;;
    *) echo "install did not pass --ignore-engines" >&2; exit 1 ;;
esac
case " $* " in
    *" --frozen-lockfile "*) echo "v5 install unexpectedly froze the lockfile" >&2; exit 1 ;;
esac

expected=$(sed -n 's/^DD_TRACE_V5_VERSION="\([^"]*\)"/\1/p' scripts/dd_trace_versions.sh)
actual=$(node -p "require('./package.json').devDependencies['dd-trace']")
if [ "$actual" != "$expected" ]; then
    echo "expected temporary dd-trace pin $expected, found $actual" >&2
    exit 1
fi

touch yarn.lock
EOF
chmod +x "$test_repo/bin/yarn"

PATH="$test_repo/bin:$PATH" TARGET_NODE_MAJOR=20 "$test_repo/scripts/install_deps.sh"

cmp "$repo_dir/package.json" "$test_repo/package.json"
if [ -e "$test_repo/yarn.lock" ]; then
    echo "install_deps.sh left a generated yarn.lock in a lockfile-free context" >&2
    exit 1
fi

echo "install_deps.sh supports a build context without yarn.lock"
