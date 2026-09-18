#!/bin/sh
set -eu

tool_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
limits_script=${SELECT_ACCOUNT_LIMITS_SCRIPT:-"$tool_dir/../ccswitch-limits/ccswitch-limits.sh"}

case "${1:-}" in
    '') ;;
    --help)
        printf 'Usage: %s\n' "$0"
        printf '  queries every ccswitch account and prints the account number selected by\n'
        printf '  account-selection-adr.md; progress and ratios go to stderr\n'
        exit 0
        ;;
    *)
        printf 'Usage: %s\n' "$0" >&2
        exit 2
        ;;
esac

# Parses API reset timestamps such as 2026-03-24T19:59:59.943648+00:00.
epoch_def='
    def timestamp_pattern: "^(?<dt>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(\\.[0-9]+)?(?<tz>Z|[+-][0-9]{2}:[0-9]{2})$";

    def epoch:
        capture(timestamp_pattern)
        | (.dt + "Z" | fromdateiso8601)
          - (if .tz == "Z" then 0
             else (if .tz[0:1] == "-" then -1 else 1 end)
                  * ((.tz[1:3] | tonumber) * 3600 + (.tz[4:6] | tonumber) * 60)
             end);
'

# One line per account: the quota state, or why it is skipped.
classify_filter="$epoch_def"'
    def reported: (.utilization | type) == "number" and (.resets_at | type) == "string";

    {account_number, email, active}
    + if .status != "ok" then {skipped: .status}
      elif ((.usage.five_hour | reported) and (.usage.seven_day | reported)) | not then {skipped: "incomplete usage response"}
      elif .usage.five_hour.utilization < 0 or .usage.seven_day.utilization < 0 then {skipped: "invalid utilization"}
      elif ((.usage.five_hour.resets_at | test(timestamp_pattern)) and (.usage.seven_day.resets_at | test(timestamp_pattern))) | not then {skipped: "invalid reset time"}
      elif .usage.five_hour.utilization >= 100 then {skipped: "5h limit reached"}
      elif .usage.seven_day.utilization >= 100 then {skipped: "7d limit reached"}
      else {five_hour: .usage.five_hour, seven_day: .usage.seven_day}
      end
'

# Eligible accounts, best first: account number, bottleneck ratio, other ratio.
rank_filter="$epoch_def"'
    def pacing_ratio($interval_seconds):
        (((.resets_at | epoch) - $now) / $interval_seconds) as $time_remaining
        | if $time_remaining > 0
          then ((100 - .utilization) / 100) / $time_remaining
          else null
          end;

    [inputs | select(has("skipped") | not)
        | (.five_hour | pacing_ratio(5 * 3600)) as $short_ratio
        | (.seven_day | pacing_ratio(7 * 24 * 3600)) as $weekly_ratio
        | select(($short_ratio | type) == "number" and ($weekly_ratio | type) == "number")
        | select($short_ratio > 0 and $weekly_ratio > 0)
        | {
            account_number,
            bottleneck: ([$short_ratio, $weekly_ratio] | min),
            headroom: ([$short_ratio, $weekly_ratio] | max),
            email
          }]
    | sort_by([-.bottleneck, -.headroom, .account_number])
    | .[]
    | [.account_number, .bottleneck, .headroom, .email]
    | @tsv
'

tab_character=$(printf '\t')

select_account() {
    classified_records=""

    while IFS= read -r usage_record; do
        classified_record=$(printf '%s' "$usage_record" | jq -c "$classify_filter")
        printf '%s' "$classified_record" | jq -r "$epoch_def"'
            def window: "\(.utilization | tostring | sub("\\.0$"; ""))% used, resets \(.resets_at | epoch | strflocaltime("%H:%M %d.%m"))";

            "account \(.account_number) \(.email)\(if .active then " (active)" else "" end): "
            + if has("skipped") then "skipped, \(.skipped)"
              else "5h \(.five_hour | window); 7d \(.seven_day | window)"
              end
        ' >&2
        classified_records="$classified_records$classified_record
    "
    done

    now=${SELECT_ACCOUNT_NOW:-$(date +%s)}
    ranking=$(printf '%s' "$classified_records" | jq -rn --argjson now "$now" "$rank_filter")

    if [ -z "$ranking" ]; then
        printf 'Error: no eligible account\n' >&2
        exit 1
    fi

    printf '%s\n' "$ranking" | while IFS="$tab_character" read -r account_number bottleneck headroom email; do
        printf 'account %s: ratios %.2f / %.2f\n' "$account_number" "$bottleneck" "$headroom" >&2
    done

    printf '%s\n' "$ranking" | head -n 1 | {
        IFS="$tab_character" read -r account_number bottleneck headroom email
        printf 'selected account %s %s\n' "$account_number" "$email" >&2
        printf '%s\n' "$account_number"
    }
}

printf 'querying accounts...\n' >&2
"$limits_script" --json | select_account
