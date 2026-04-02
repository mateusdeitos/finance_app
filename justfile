# Build the Claude container image
build:
    docker compose build claude

# Start an interactive Claude Code session inside the container
claude *args:
    docker compose run --rm claude claude --dangerously-skip-permissions {{args}}
