# Wibe Crawler

# Setup

Ensure you have docker installed. Run this command in the project root.

```bash
docker compose up
cd backend && bun db:push #only when db schema changes
```

In the frontend and backend folders, run this command.

```bash
bun install
bun dev
```