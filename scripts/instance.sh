#!/usr/bin/env bash
# Run an isolated parallel stack (frontend + api + postgres) for development.
#
# Each instance N gets its own docker compose project and a non-conflicting set
# of host ports, computed as base + (N-1)*10:
#
#   N=1 -> frontend :3000  api :3001  postgres :5432   (project gammaray-1)
#   N=2 -> frontend :3010  api :3011  postgres :5442   (project gammaray-2)
#   N=3 -> frontend :3020  api :3021  postgres :5452   (project gammaray-3)
#
# Containers stay isolated (own network + own postgres volume), so two instances
# never share data. The frontend's browser-side API URL and the API's CORS
# origin are derived from these ports, so each browser talks to its own API.
#
# Usage:
#   scripts/instance.sh <N> up [-d]        # start instance N (add -d to detach)
#   scripts/instance.sh <N> down [-v]      # stop instance N (add -v to drop its DB volume)
#   scripts/instance.sh <N> ps             # show instance N's containers
#   scripts/instance.sh <N> <any-compose-subcommand> [args...]
#
# Example: two instances side by side
#   scripts/instance.sh 1 up -d
#   scripts/instance.sh 2 up -d
#   open http://localhost:3000   # instance 1
#   open http://localhost:3010   # instance 2
set -euo pipefail

N="${1:?usage: instance.sh <N> <up|down|ps|...> [args]}"
shift
if ! [[ "$N" =~ ^[1-9][0-9]*$ ]]; then
  echo "instance number must be a positive integer, got: $N" >&2
  exit 1
fi

offset=$(( (N - 1) * 10 ))
export PORT=$(( 3000 + offset ))
export API_PORT=$(( 3001 + offset ))
export DB_PORT=$(( 5432 + offset ))
project="gammaray-${N}"

cd "$(dirname "$0")/.."

echo "instance ${N}: frontend :${PORT}  api :${API_PORT}  postgres :${DB_PORT}  (project ${project})" >&2
exec docker compose -p "$project" "$@"
