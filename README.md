 <div align="center">

# AutoHeal SRE

**A lightweight service-monitoring and controlled auto-recovery platform.**

Track HTTP health, latency, uptime, incidents, and recovery attempts from one dashboard.

[![CI](https://github.com/GS01-wyatt/AutoHeal/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GS01-wyatt/AutoHeal/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue?logo=typescript)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/License-TBD-lightgrey)

</div>

---

## Overview

AutoHeal SRE is a full-stack project for learning and demonstrating core Site Reliability Engineering workflows. It periodically checks configured HTTP/HTTPS endpoints, records health-check results, tracks service metrics, and opens incidents after consecutive failures.

When a supported recovery target is configured, the recovery engine can attempt a controlled restart, verify the service again, and resolve or escalate the incident.

The included recovery worker is intentionally restricted to a single allowlisted local demo service (`demo-app`). This project does **not** automatically restart arbitrary websites, cloud resources, or production infrastructure.

## Features

- **HTTP Health Checks** — Configurable check intervals and request timeouts.
- **Service Monitoring Dashboard** — View service status, uptime, latency, and check intervals.
- **Incident Management** — Track open, recovering, resolved, and escalated incidents.
- **Controlled Auto-Recovery** — Failure thresholds, retry limits, cooldowns, and post-restart verification.
- **Demo Fault Simulation** — Simulate failures, slow responses, crashes, and recovery when demo mode is enabled.
- **Operational History** — Persist checks, incidents, recovery attempts, and logs in SQLite.
- **Backend Security** — Zod validation, Helmet security headers, and structured Pino logs.
- **Containerized Deployment** — Docker Compose, health checks, non-root containers, and a private backend service.
- **Automated CI Pipeline** — Backend checks, frontend tests and build, plus Docker smoke tests.

## Architecture

```text
Browser
   |
   v
React + TypeScript Dashboard
   |  /api (proxied by Nginx)
   v
Express + TypeScript API
   |----------------------|
   v                      v
HTTP Health Checker    Healing Engine
   |                      |
   v                      v
Scheduler + SQLite    Allowlisted demo-app Worker
```

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, React Router, Recharts, Lucide |
| Backend | Node.js, Express 5, TypeScript, Zod, Pino, Helmet |
| Database | SQLite with better-sqlite3 |
| Testing | Vitest, Testing Library, Supertest |
| Deployment | Docker, Docker Compose, Nginx |
| CI/CD | GitHub Actions |

## Getting Started

### Prerequisites

- Git
- Docker Desktop with Docker Compose
- A modern web browser

### Run with Docker Compose

Clone the repository:

```bash
git clone https://github.com/GS01-wyatt/AutoHeal.git
cd AutoHeal
```

Build and start the application:

```bash
docker compose up --build -d
```

Open the dashboard:

**http://localhost:8080**

Check container status:

```bash
docker compose ps
```

View application logs:

```bash
docker compose logs -f
```

Stop the application:

```bash
docker compose down
```

The SQLite database is stored in the `autoheal-data` Docker volume so it can survive container recreation.

To remove the containers and database volume:

```bash
docker compose down -v
```

**Warning:** The `-v` option permanently deletes the stored application data.

## Demo Mode

The recovery worker and fault simulator are enabled only when `DEMO_MODE=true`.

For a local demonstration, create a `.env` file in the repository root:

```dotenv
DEMO_MODE=true
DASHBOARD_PORT=8080
```

Restart the application:

```bash
docker compose up --build -d
```

Use the dashboard's demo or simulation controls to exercise the supported recovery target.

**Important:** Demo mode is intended for local learning and demonstration, not production recovery.

## Configuration

The Docker Compose configuration supports these root-level variables:

| Variable | Default | Purpose |
|---|---|---|
| `DASHBOARD_PORT` | `8080` | Host port for the dashboard |
| `LOG_LEVEL` | `info` | Backend log verbosity |
| `FAILURE_THRESHOLD` | `3` | Consecutive failed checks before incident handling |
| `MAX_RECOVERY_RETRIES` | `3` | Maximum recovery attempts per incident |
| `RECOVERY_COOLDOWN_MS` | `60000` | Cooldown between recovery attempts |
| `VERIFY_DELAY_MS` | `3000` | Wait after restart before health verification |
| `MAX_RESTARTS_PER_HOUR` | `6` | Restart-loop protection limit |
| `DEMO_MODE` | `false` | Enables the local demo worker and fault simulator |

The backend also supports `PORT`, `DB_PATH`, `DEFAULT_INTERVAL_MS`, `DEFAULT_TIMEOUT_MS`, and `SCHEDULER_ENABLED`.

See [`backend/.env.example`](backend/.env.example) for the backend environment template.

## Local Development

### Backend

```bash
cd backend
npm ci
npm run dev
```

Run backend checks:

```bash
npm run typecheck
npm test
npm run build
```

### Frontend

Open a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite displays the local development URL in the terminal. Frontend development and API proxy settings are defined in the project configuration.

## API Overview

The API is served under `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Application and database health |
| `GET` | `/api/services` | List monitored services |
| `POST` | `/api/services` | Add a service |
| `GET` | `/api/services/:id` | Retrieve a service |
| `PATCH` | `/api/services/:id` | Update a service |
| `DELETE` | `/api/services/:id` | Delete a service |
| `POST` | `/api/services/:id/check` | Run a manual health check |
| `GET` | `/api/services/:id/checks` | Retrieve recent check results |
| `GET` | `/api/metrics` | Retrieve service metrics |
| `GET` | `/api/incidents` | List incidents |
| `GET` | `/api/info` | Read non-sensitive runtime settings |

Additional recovery and simulation routes are implemented in the backend.

For exact request schemas and response formats, refer to the route files under [`backend/src/routes`](backend/src/routes).

## CI Pipeline

The GitHub Actions workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes to `main`/`master` and pull requests.

The pipeline includes:

1. Backend type checking, tests, and build.
2. Frontend tests and production build.
3. Docker image build and container startup.
4. Docker smoke tests.
5. Checks for backend port exposure and container user configuration.

A successful CI run confirms that the automated checks in the workflow passed. It does not, by itself, prove production readiness.

## Security Notes

- The backend port is not published directly to the host by Docker Compose; the dashboard accesses it through the internal Compose network.
- Recovery requests use an allowlisted target key instead of arbitrary shell commands.
- The recovery worker is designed for the local `demo-app` only.
- Never commit `.env` files, credentials, API keys, or private configuration.
- Before exposing the dashboard to an untrusted network, add authentication and authorization, TLS, rate limiting, and deployment-specific security controls.

## Current Scope and Limitations

- The included worker demonstrates controlled recovery of a local demo process. It is not a production orchestrator for Kubernetes, AWS, or arbitrary services.
- Uptime and latency depend on the check history and calculation window used by the application.
- Monitoring a public URL does not guarantee that the monitored service is globally unavailable when a check fails.
- Production deployment and cloud auto-healing require additional configuration, security controls, and testing.

## Roadmap

- Authentication and role-based access control
- Alerting integrations with email, Slack, or webhooks
- Prometheus metrics and Grafana dashboards
- Container vulnerability scanning
- Cloud deployment with least-privilege permissions
- Additional explicitly allowlisted recovery adapters
- Improved incident analytics and service reliability reporting

## Contributing

Issues and pull requests are welcome.

For substantial changes, open an issue first to discuss the proposed approach. Include tests for behavior changes and never commit secrets.

## License

No license is currently declared in the project. Add a `LICENSE` file before granting others explicit reuse rights.

---

<div align="center">

**Built as a hands-on SRE / Cloud & DevOps learning project.**

</div>
