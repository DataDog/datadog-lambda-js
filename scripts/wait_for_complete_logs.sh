#!/bin/bash

function wait_for_complete_logs() {
    if [ "$#" -lt 4 ]; then
        echo "wait_for_complete_logs requires an expected count, attempts, interval, and command" >&2
        return 2
    fi

    local expected_completion_count=$1
    local max_attempts=$2
    local interval_seconds=$3
    shift 3

    case "$expected_completion_count" in
        ''|*[!0-9]*|0)
            echo "Expected completion count must be a positive integer" >&2
            return 2
            ;;
    esac
    case "$max_attempts" in
        ''|*[!0-9]*|0)
            echo "Maximum attempts must be a positive integer" >&2
            return 2
            ;;
    esac
    case "$interval_seconds" in
        ''|*[!0-9]*)
            echo "Retry interval must be a non-negative integer" >&2
            return 2
            ;;
    esac

    local attempt=1
    local command_status=0
    local raw_logs=''
    local completion_count=0

    while [ "$attempt" -le "$max_attempts" ]; do
        completion_count=0
        if raw_logs=$("$@"); then
            completion_count=$(printf '%s\n' "$raw_logs" | grep -c '^END Duration:' || true)
            if [ "$completion_count" -ge "$expected_completion_count" ]; then
                printf '%s\n' "$raw_logs"
                return 0
            fi
            echo "Waiting for complete logs: attempt $attempt/$max_attempts found $completion_count of" \
                "$expected_completion_count completion records" >&2
        else
            command_status=$?
            echo "Log command attempt $attempt/$max_attempts failed with exit code $command_status" >&2
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            sleep "$interval_seconds"
        fi
        attempt=$((attempt + 1))
    done

    echo "FAILURE: Logs remained incomplete after $max_attempts attempts; found $completion_count of" \
        "$expected_completion_count completion records" >&2
    printf '%s\n' "$raw_logs" | tail -30 >&2
    return 1
}
