#!/usr/bin/env bash

set -uo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
failures=0

run_check() {
  check_name=$1
  shift

  printf '\n== %s ==\n' "$check_name"
  if "$@"; then
    printf 'PASS: %s\n' "$check_name"
  else
    failures=$((failures + 1))
    printf 'FAIL: %s\n' "$check_name" >&2
  fi
}

run_check prerequisites "$script_dir/verify-prerequisites.sh"
run_check harnesses "$script_dir/verify-harnesses.sh"
run_check herdr-integrations "$script_dir/verify-herdr-integrations.sh"
run_check firstmate "$script_dir/verify-firstmate.sh"

printf '\n== Overall summary ==\n'
if [ "$failures" -ne 0 ]; then
  printf '%s verification group(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'All verification groups passed\n'
