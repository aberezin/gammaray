# Available Tools in This Container

You are running in a Docker container with full sudo access. Here's what you have:

## Pre-installed
- **Node.js LTS** - with npm
- **Docker CE** with Docker Compose
- git, curl, wget, jq

## Languages & Runtimes
- **Go 1.26.1** - /usr/local/go/bin/go
- **Python 3.12.11** (via pyenv) - default python
- **Node.js LTS** - with npm

## Go Tools
- golangci-lint - linter aggregator
- gopls - language server
- dlv - delve debugger
- staticcheck - static analysis
- gomodifytags - struct tag modifier
- impl - interface implementation generator
- gotests - test generator
- gofumpt - stricter gofmt

## Python Tools
- flake8 - linter
- black - formatter
- isort - import sorter
- autoflake - remove unused imports
- pyright - type checker
- mypy - type checker
- vulture - dead code finder
- pytest, pytest-cov - testing
- pipenv, poetry - dependency management
- pyenv - python version management

## Node.js Tools
- eslint, prettier - linting/formatting
- typescript, ts-node - TypeScript
- yarn, pnpm - package managers
- nodemon, pm2 - process management
- create-react-app, @vue/cli, @angular/cli - framework CLIs
- express-generator - Express scaffolding
- newman - Postman CLI
- http-server, serve - static servers
- lighthouse - performance auditing
- @storybook/cli - component development

## Infrastructure & DevOps
- terraform - infrastructure as code
- kubectl - Kubernetes CLI
- helm - Kubernetes package manager
- docker, docker-compose - containerization
- gh - GitHub CLI

## Databases & Data
- sqlite3 - SQLite CLI
- postgresql-client (psql) - PostgreSQL CLI
- mysql-client - MySQL CLI
- redis-tools (redis-cli) - Redis CLI

## Shell & System Tools
- git - version control
- curl, wget, httpie - HTTP clients
- jq - JSON processor
- tree - directory visualization
- fd-find (fdfind) - fast file finder
- ripgrep (rg) - fast grep
- bat - cat with syntax highlighting
- exa - modern ls
- silversearcher-ag (ag) - code search
- shellcheck - shell script linter
- shfmt - shell formatter
- tmux - terminal multiplexer
- htop - process viewer

## C/C++ Tools
- gcc, g++, make, cmake - compilation
- clang-format - code formatter
- valgrind - memory debugging
- gdb - debugger
- strace, ltrace - tracing

## Orchestrating & exposing workloads
You run with the Docker socket mounted (docker-out-of-docker) against this project's
own Colima VM. Containers you start are SIBLINGS on that VM — detached ones outlive
your session, and the human can reach them.
- Build workloads as SELF-CONTAINED images (a Dockerfile that COPYs the code in). Do
  NOT `-v`/bind-mount the workspace into a sibling container — the workspace path is
  not visible to the VM daemon, so the mount comes up empty. COPY the code instead.
- Put workloads that talk to each other on the shared `cb-net` network so they reach
  each other by container name (`http://api:8080`); `cb-browser net` prints the name.
- To let the HUMAN reach a workload from their Mac's browser, publish the port and run
  it detached: `docker run -d --restart unless-stopped -p 8080:8080 <image>`. It is
  then reachable at **this project's VM IP** — the collision-free address; tell the
  human to run `claudebox ip` on their Mac to get it, e.g. `http://<vm-ip>:8080`.
  (`http://localhost:8080` also works via colima's port-forward, but it COLLIDES if
  another project publishes the same port — so give them the VM IP, not localhost.)

## Secrets & credentials
NEVER put a secret value on a command line — arguments leak into shell history, `ps`,
process listings, and logs. This is a hard rule for the flows you build here AND for
anything you tell the human to run.
- This project's secrets live in `.claudebox/secrets.env` on the host (gitignored,
  chmod 600, `KEY=VALUE` per line); the harness injects them into you as env on every
  run. Read a credential from its env var — never hardcode, echo, or commit it.
- Need a NEW secret from the human? Ask them to add a line to `.claudebox/secrets.env`
  (or to bootstrap with `--gh-token` / `--secrets-file`) — never ask them to paste it
  as a command argument or inline in a prompt.
- GitHub is pre-wired: if `GH_TOKEN` is set, `gh` and `git push https://…` are already
  authenticated (no `gh auth login`). Pass secrets to sibling workloads through their
  environment (`docker run -e NAME` inheriting from your env, or an env-file) — never
  baked into an image layer.

## Browser testing (self-contained)
To test a web workload you spin up, use the baked-in `cb-browser` helper — it runs
headless Chromium (Playwright) in a sibling container against your workload and
writes artifacts into the workspace. Put workloads on the shared `cb-net` network
so they're reachable by name:
- `docker run -d --name api --network cb-net your/image`
- `cb-browser shot http://api:8080` → `./cb-browser-out/{screenshot.png,page.json}` (page.json has status/title/text/consoleErrors)
- `cb-browser script ./test.cjs` → run your own Playwright script (`require('playwright')`). Your script is
  READ-ONLY at `/work`; write ALL artifacts (screenshots, JSON, logs) to **`/out`** — it maps to
  `./cb-browser-out` in the workspace (also in `$CB_OUT`). cwd is `/out`, so `page.screenshot({path:'shot.png'})`
  lands there. Writing to `/work` or a workspace path fails with `EROFS` — use `/out` instead of dropping the output.
- `cb-browser watch http://api:8080` → headful browser with a noVNC web UI the human watches/drives live at http://<project-vm-ip>:<port>; `cb-browser watch-stop` to stop
- `cb-browser net` → the network name to attach workloads to
This is the standard way to browser-test here; prefer it over ad-hoc setups.
Opt-in extra: if the human ran `claudebox browser-bridge up` on their Mac, the env
var `CLAUDEBOX_HOST_CDP_URL` is set and `cb-browser cdp <url>` drives THEIR real
Chrome via CDP (dedicated debug profile). Only available when they explicitly start
the bridge; don't rely on it — the self-contained A modes above are the default.
Important: in `cdp` mode the browser runs on the MAC, so `<url>` (and any websockets
the app opens) must be reachable **from the Mac** — the project VM's IP or
`localhost:<port>`, NOT a `cb-net` container name like `http://api:8080` (the Mac's
Chrome can't resolve those). For cb-net / in-VM targets, use `shot`/`script` instead.

## Reporting a bug in the claudebox FRAMEWORK
If you hit something that looks like a bug in the harness that runs you — the
wrapper, this entrypoint, the image, or the Colima/Docker networking — as opposed
to a bug in the project you're building, FILE IT with `cb-report-bug`. Don't try to
patch the framework from inside a project, and don't just mention it in passing —
the report is the durable signal that reaches the maintainer.

This also covers a baked helper (`cb-browser`, `cb-report-bug`, the `cb-net`/VM
setup, etc.) behaving surprisingly, being under-documented, or forcing you into a
workaround or a degraded approach — **file it EVEN IF you found a workaround or
worked around the limitation.** A silent workaround means the maintainer never
learns the tool tripped you up, so the friction never gets fixed. If a tool made
you change your plan ("the mount is read-only, so I'll skip screenshots"), that is
exactly the signal worth reporting.
```
cb-report-bug "<short title>" --layer wrapper|entrypoint|image|networking|other <<'EOF'
## What I was doing
## Expected vs actual
## Minimal repro
## Hypothesis
EOF
```
Reports go to a shared host-visible location the maintainer reviews across all
projects. Use it whenever the framework — not your code — is what's misbehaving.

## What survives a rebuild / restart (and what doesn't)
Your **workspace** and your **Claude session** (history, `--continue`, settings,
plugins — everything under `~/.claude`) live on HOST bind-mounts, so they SURVIVE the
container being rebuilt or recreated: you resume right where you left off. The harness
recreates this container when the image is updated (you'll see a "recreating on the
new image" message), and that's safe for your session.
What does NOT survive: anything written to the container's own filesystem OUTSIDE
those mounts — packages you `apt install` / `npm i -g` at runtime, and scratch files
outside the workspace and `~/.claude`. After a rebuild/recreate they're gone.
- Make setup durable: put it in `~/.claude/init.d/<name>.sh` (runs on container
  create, lives in the mount) instead of running it ad-hoc — it re-applies next time.
- If a tool you keep needing isn't in the image, that's framework feedback: file it
  with `cb-report-bug` so it gets baked in, rather than reinstalling every session.

## Notes
- You have passwordless sudo access
- Docker socket may be mounted for docker-in-docker. The workspace is mounted at the exact same path as on the host, so when running docker commands with volume mounts, use the workspace path as the base (e.g. -v "$PWD/data:/data" will resolve correctly on the host)
- claude CLI at ~/.claude (native install, can self-update)
- Convenience commands are named `cb-*` (on PATH). Run **`cb-help`** to list them with
  one-line summaries (e.g. `cb-browser`, `cb-report-bug`). Baked ones live in
  /usr/local/bin; you can add your own as `~/.claude/bin/cb-<name>` (in PATH) — give it a
  `# summary: ...` header line so `cb-help` describes it.
- ~/.claude/bin is in PATH — custom scripts placed here by the user are available to you
- ~/.claude/init.d/*.sh scripts run once on first container create (not on subsequent starts)
- Extra host directories may be mounted via CLAUDEBOX_MOUNT_* env vars — check what's available if you need files outside the workspace

## IMPORTANT
If you need to overwrite or restructure this CLAUDE.md file for your project, FIRST save the container environment notes above to your memory or to a separate file (e.g. ~/.claude/CONTAINER.md) so you don't lose the container-specific information. These notes are auto-generated only on first run and won't be recreated if the file already exists.
