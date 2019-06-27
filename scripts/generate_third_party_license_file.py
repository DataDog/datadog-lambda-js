import csv
import json
import re
import shlex
import subprocess

REPO_EXCEPTIONS = {"eyes": "https://github.com/cloudhead/eyes.js"}

COPYRIGHT_EXCEPTIONS = ["aws-sdk", "datadog-lambda-layer-js"]

"""
Exceptions to this scripts assumptions about the formatting of LICENSE files:

querystring contains the whole license
colors.js doesn't have "Copyright" starting at the beginning of the line (https://github.com/Marak/colors.js/blob/master/LICENSE)
cycles uses the JSON license (https://github.com/dscape/cycle)
aws-xray-sdk puts the copyright string in NOTICE.txt instead of in LICENSE
datadog-lambda-js doesn't put a copyright string in the LICENSE file
aws-sdk-js uses the same format ^
base64-js misses the name after the copyright year (github.com/beatgammit/base64-js)
querystring puts the whole license in one line
"""

def get_repo_url(dep_name, dep_meta):
    repo_url = dep_meta.get("repository", REPO_EXCEPTIONS.get(dep_name, "NO REPO"))
    if repo_url.startswith("https"):
        return re.search(r"https:\/\/(.*)", repo_url).group(1)
    return repo_url


if __name__ == "__main__":
    raw_output = subprocess.check_output(
        shlex.split("license-checker --json --production --start ..")
    )
    deps = json.loads(raw_output)
    alphabetized_dep_names = sorted(deps.keys())

    formatted_deps = []
    for dep in alphabetized_dep_names:
        dep_meta = deps[dep]
        dep_name = re.search(r"([\w-]+)@", dep).group(1)
        repo_url = get_repo_url(dep_name, dep_meta)
        license = dep_meta.get("licenses", "LICENSE NOT FOUND")

        if "Custom" in license:
            print("Custom license for {}".format(dep_name))

        # Extract the "Copyright ..." line from the license file.
        # Naively handles multi-line copyrights starting with "Copyright"
        # and ending with two newlines.
        license_file = dep_meta.get("licenseFile", None)
        dep_copyright = ""
        if license_file:
            with open(license_file) as f:
                contents = f.read()
                # https://stackoverflow.com/a/52347904
                matches = re.findall(r"(Copyright.*(\n\S.*)*)", contents)
                if len(matches) > 0:
                    dep_copyright = matches[0][0].replace("\n", " ")
        else:
            print("No license file for {}".format(dep_name))

        formatted_deps.append(
            {
                "Component": dep_name,
                "Origin": repo_url,
                "License": license,
                "Copyright": dep_copyright,
            }
        )

    with open("../LICENSE-3rdparty.csv", "w") as csv_file:
        fieldnames = ["Component", "Origin", "License", "Copyright"]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for dep in formatted_deps:
            writer.writerow(dep)