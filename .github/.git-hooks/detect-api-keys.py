#!/usr/bin/env python
from __future__ import print_function

import argparse
import re
import sys


def detect_aws_access_key(line):
    match = re.search(r"(?<![A-Z0-9])[A-Z0-9]{20}(?![A-Z0-9])", line)
    return match, "AWS access key"


def detect_aws_secret_key(line):
    match = re.search(r"(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])", line)
    return match, "AWS secret key"


def detect_dd_api_key(line):
    match = re.search(r"(?<![a-fA-F0-9])[a-fA-F0-9]{32}(?![a-fA-F0-9])", line)
    return match, "Datadog API key"


def detect_dd_app_key(line):
    match = re.search(r"(?<![a-fA-F0-9])[a-fA-F0-9]{40}(?![a-fA-F0-9])", line)
    return match, "Datadog app key"


def key_found_message(args):
    return (
        "\033[91m"
        "Potential {} found in {} at line {} and column {}. "
        "Please remove the key before committing these changes."
        "\033[0m".format(*args)
    )


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("filenames", nargs="*", help="Filenames to check.")
    args = parser.parse_args(argv)

    # add or remove functions here
    functions_to_run = [
        detect_aws_access_key,
        detect_aws_secret_key,
        detect_dd_api_key,
        detect_dd_app_key,
    ]

    files_with_key = []

    for filename in args.filenames:
        with open(filename, "r") as f:
            content = f.readlines()
            f.close()

        for i, line in enumerate(content):
            for func in functions_to_run:
                match, name = func(line)
                if match != None:
                    files_with_key.append((name, filename, i + 1, match.end()))

    if files_with_key:
        for file in files_with_key:
            print(key_found_message(file))
        return 1
    else:
        return 0


if __name__ == "__main__":
    sys.exit(main())
