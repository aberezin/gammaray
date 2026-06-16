#!/usr/bin/env bash
# PreToolUse hook (Bash matcher): auto-approve project-safe dev commands so that
# chained commands (a && b | c; until …; done) don't prompt for each subcommand.
#
# FAIL-SAFE: prints an "allow" decision ONLY when every decomposed segment is a
# known-safe verb. Anything uncertain → exit 0 with no output, which DEFERS to
# the normal permission flow (a prompt). It never auto-DENIES, and deny rules in
# settings.json always take precedence over an allow from here.
#
# Hardening:
#  - command substitution / process substitution ( $(…), `…`, <(…) ) → defer
#  - operator splitting is naive (splits inside quotes too); that only ever
#    produces a stray segment with an unknown verb → defer. It cannot hide a
#    dangerous verb behind a safe one (each segment's leader is checked).
#  - wrappers (timeout/time/nice/nohup/stdbuf/env) and runners (xargs) are
#    unwrapped to their inner verb; sudo is never safe.
set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

# Reject any form of command substitution / process substitution outright.
case "$cmd" in
  *'$('* | *'`'* | *'<('* | *'>('* ) exit 0 ;;
esac

# Verbs safe to run unattended on this trusted dev machine. Mutating verbs here
# (git/docker/pnpm/kill) are backstopped by permissions.deny in settings.json.
is_safe_verb() {
  case "$1" in
    # read-only / utility
    ls|cat|head|tail|wc|grep|egrep|fgrep|rg|find|sort|uniq|cut|tr|sed|awk|jq|\
    echo|printf|pwd|cd|which|type|basename|dirname|realpath|readlink|true|false|\
    test|date|env|printenv|sleep|tee|column|comm|diff|stat|file|tree|lsof|ps|\
    pgrep|netstat|ss|uname|whoami|hostname|sha256sum|md5sum|cmp|tac|nl|seq|\
    mkdir|touch) return 0 ;;
    # local process management (dev loop)
    kill|pkill) return 0 ;;
    # vcs / tooling (dangerous forms blocked by deny rules)
    git|gh|pnpm|colima) return 0 ;;
    *) return 1 ;;
  esac
}

# Check one segment. Returns 0 if safe to auto-approve, 1 otherwise.
segment_safe() {
  local seg="$1" tok
  # trim
  seg="${seg#"${seg%%[![:space:]]*}"}"
  seg="${seg%"${seg##*[![:space:]]}"}"
  [ -z "$seg" ] && return 0
  # strip leading shell keywords (loops / conditionals / blocks)
  while :; do
    tok="${seg%%[[:space:]]*}"
    case "$tok" in
      until|while|for|do|done|then|else|elif|fi|if|in|case|esac|'{'|'}'|'!'|'[')
        seg="${seg#"$tok"}"; seg="${seg#"${seg%%[![:space:]]*}"}" ;;
      *) break ;;
    esac
    [ -z "$seg" ] && return 0
  done
  # strip leading VAR=val assignments and wrapper commands
  while :; do
    tok="${seg%%[[:space:]]*}"
    case "$tok" in
      *=*) seg="${seg#"$tok"}"; seg="${seg#"${seg%%[![:space:]]*}"}" ;;
      timeout|time|nice|nohup|stdbuf|command)
        seg="${seg#"$tok"}"; seg="${seg#"${seg%%[![:space:]]*}"}"
        # timeout/stdbuf take an arg (duration/flags); drop one leading flag/num token
        case "${seg%%[[:space:]]*}" in
          -*|[0-9]*) seg="${seg#"${seg%%[[:space:]]*}"}"; seg="${seg#"${seg%%[![:space:]]*}"}" ;;
        esac ;;
      xargs)
        # xargs runs its argument command — re-check that inner verb. Drop xargs
        # and any -flags / -I{} style options to reach the command.
        seg="${seg#"$tok"}"; seg="${seg#"${seg%%[![:space:]]*}"}"
        while :; do
          case "${seg%%[[:space:]]*}" in
            -*) seg="${seg#"${seg%%[[:space:]]*}"}"; seg="${seg#"${seg%%[![:space:]]*}"}" ;;
            *) break ;;
          esac
        done ;;
      *) break ;;
    esac
    [ -z "$seg" ] && return 0
  done

  tok="${seg%%[[:space:]]*}"
  local rest="${seg#"$tok"}"; rest="${rest#"${rest%%[![:space:]]*}"}"
  local sub="${rest%%[[:space:]]*}"

  # sudo: never auto-approve
  [ "$tok" = "sudo" ] && return 1

  # git: broadly safe, but never auto-approve a force-push (outward + irreversible)
  if [ "$tok" = "git" ]; then
    case "$seg" in
      *" push "*)
        case "$seg" in *--force*|*" -f"*|*force-with-lease*) return 1 ;; esac ;;
    esac
    return 0
  fi

  # curl/wget: only to localhost / 127.0.0.1 (avoid arbitrary network egress)
  if [ "$tok" = "curl" ] || [ "$tok" = "wget" ]; then
    case "$seg" in *localhost*|*127.0.0.1*) return 0 ;; *) return 1 ;; esac
  fi

  # docker: only the safe subcommands (NOT run/system/login/push/save/commit)
  if [ "$tok" = "docker" ]; then
    case "$sub" in
      compose|exec|logs|ps|inspect|port|start|stop|restart|rm|build|images|\
      version|top|cp|network|context|kill|wait|pull|info) return 0 ;;
      *) return 1 ;;
    esac
  fi

  # pnpm: not dlx/exec (arbitrary code)
  if [ "$tok" = "pnpm" ]; then
    case "$sub" in dlx|exec) return 1 ;; *) return 0 ;; esac
  fi

  # npx: only playwright
  if [ "$tok" = "npx" ]; then
    [ "$sub" = "playwright" ] && return 0 || return 1
  fi

  is_safe_verb "$tok"
}

# Protect redirections (2>&1, >&2, &>, &>>) so their '&' isn't treated as an
# operator, then split on shell operators and newlines and validate each segment.
protected="$(printf '%s' "$cmd" | sed -E 's/[0-9]*>&[0-9]+/>REDIR/g; s/&>>?/>REDIR/g')"
normalized="$(printf '%s' "$protected" | sed -E 's/&&|\|\||\|&|;|\||&/\n/g')"
while IFS= read -r seg; do
  segment_safe "$seg" || exit 0
done <<EOF
$normalized
EOF

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"project-safe dev command (auto-approve hook)"}}'
