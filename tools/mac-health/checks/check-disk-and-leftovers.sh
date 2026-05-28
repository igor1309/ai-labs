#!/bin/sh
# Wrapper invoked by the disk-leftovers LaunchAgent. Runs both checks back
# to back; a failure in one MUST NOT prevent the other from running.

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

"$script_dir/check-disk.sh"      || true
"$script_dir/check-leftovers.sh" || true
