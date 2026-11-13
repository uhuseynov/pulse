# Pulse

<p align="center">
  <strong>Connect. Talk. Share.</strong>
</p>

<p align="center">
  A real-time communication platform for communities, messaging, voice and video.
</p>

---

## About

**Pulse** is a full-stack real-time communication platform designed to bring people together through instant messaging, online presence, voice rooms and video communication.

Inspired by modern communication platforms, Pulse aims to provide a seamless experience for creating communities, collaborating and connecting in real time.

This project is being developed as a hands-on software engineering project, focusing on full-stack development, real-time networking and scalable backend architecture.

## Features

### Available now

- [x] User registration and authentication
- [x] Servers with invite codes and member roles
- [x] Text channels and message history
- [x] Real-time message delivery
- [x] Typing indicators and unread markers
- [x] Online and offline presence
- [x] Voice channels with speaking and mute indicators

### Planned

- [ ] Idle presence
- [ ] Friend system and direct messages
- [ ] Video calls
- [ ] Screen sharing
- [ ] User roles and permissions

## Tech Stack

| Category | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | NestJS, Node.js |
| API | REST |
| Real-time Communication | Socket.IO, WebSocket |
| Database | PostgreSQL |
| ORM | Prisma |
| Caching & Presence | Redis |
| Audio & Video | LiveKit, WebRTC |
| Containerization | Docker |
| Hosting | Vercel, Render, Neon |
| CI | GitHub Actions |
| Version Control | Git, GitHub |

## Architecture

Pulse follows a modular architecture with separate frontend and backend applications.

```text
pulse/
│
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # NestJS backend
│
├── packages/
│   └── shared/           # Shared TypeScript types
│
├── infrastructure/
│   └── docker/           # Infrastructure configuration
│
├── docs/                 # Technical documentation
│
├── docker-compose.yml
├── package.json
└── README.md
```

### Communication Architecture

- **REST API:** Handles authentication and standard application requests.
- **Socket.IO:** Handles real-time messaging, events and user presence.
- **PostgreSQL:** Stores persistent application data.
- **Redis:** Supports caching, presence and distributed real-time events.
- **LiveKit:** Handles real-time audio and video communication through WebRTC.

## Getting Started

### Prerequisites

Make sure you have installed:

- Node.js 24 LTS
- npm
- Docker Desktop
- Git

### 1. Clone the repository

```bash
git clone https://github.com/uhuseynov/pulse.git
cd pulse
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create the environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Then set `JWT_SECRET` in `apps/api/.env` to a long random value. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis.

### 5. Set up the database

```bash
npm run db:deploy
```

This applies the migrations in `apps/api/prisma/migrations`. After changing `schema.prisma`, create a new migration with `npm run db:migrate`.

### 6. Start the backend

```bash
npm run dev:api
```

Backend: `http://localhost:4000`

Health endpoint: `http://localhost:4000/health`

### 7. Start the frontend

Open another terminal:

```bash
npm run dev:web
```

Frontend: `http://localhost:3000`

## API

All routes except `/health`, `/auth/register` and `/auth/login` require an `Authorization: Bearer <token>` header.

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Sign in |
| GET | `/auth/me` | Current user |
| GET | `/servers` | Servers the user belongs to |
| POST | `/servers` | Create a server |
| POST | `/servers/join` | Join a server with an invite code |
| GET | `/servers/:serverId` | Server with its channels and members |
| POST | `/servers/:serverId/leave` | Leave a server |
| DELETE | `/servers/:serverId` | Delete a server (owner) |
| POST | `/servers/:serverId/channels` | Create a channel (owner, admin) |
| DELETE | `/channels/:channelId` | Delete a channel (owner, admin) |
| GET | `/channels/:channelId/messages` | Message history (`before`, `limit`) |
| POST | `/channels/:channelId/messages` | Send a message |
| GET | `/voice/config` | Whether voice rooms are available |
| POST | `/channels/:channelId/voice-token` | Token for joining a voice channel |

Socket.IO clients connect to the same origin with `auth: { token }` and receive `message:created`, `channel:created`, `channel:deleted`, `member:joined`, `member:left`, `server:deleted`, `presence:changed`, `voice:participants` and `typing`.

## Testing

```bash
npm test            # API unit tests
npm run test:e2e    # API end-to-end tests
```

The end-to-end tests need PostgreSQL to be running. They create a separate `pulse_test` database, so development data is left alone.

## Deployment

Pulse runs on three free services: the web app on Vercel, the API on Render and PostgreSQL on Neon. Pushing to `main` redeploys both apps.

### 1. Database (Neon)

Create a project at [neon.com](https://neon.com) in a European region and copy its **direct** connection string (the one without `-pooler` in the host name).

### 2. API (Render)

In the [Render dashboard](https://dashboard.render.com), choose **New > Blueprint** and select this repository. Render reads `render.yaml`, which defines the build and start commands and generates `JWT_SECRET`. Enter the two values it asks for:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Neon connection string |
| `WEB_ORIGIN` | The URL of the web app, for example `https://pulse.vercel.app` |

Migrations are applied every time the service starts.

### 3. Web (Vercel)

Import the repository at [vercel.com/new](https://vercel.com/new), set **Root Directory** to `apps/web`, and add one environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | The URL of the API, for example `https://pulse-api.onrender.com` |

If the Vercel URL differs from the one given to Render, update `WEB_ORIGIN` there; the API only accepts requests from that origin.

### Voice rooms (LiveKit)

Voice is optional. Create a free project at [cloud.livekit.io](https://cloud.livekit.io), then add its `LIVEKIT_URL` (starts with `wss://`), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to the API's environment on Render, or to `apps/api/.env` locally. Until all three are set the app runs without voice channels.

### Good to know

- The free Render instance sleeps after 15 minutes without traffic. The next request wakes it, which takes up to a minute.
- Sign-in and sign-up are limited to 10 attempts per minute per IP address (`AUTH_RATE_LIMIT`).

## Development Roadmap

- [x] Initial monorepo structure
- [x] Next.js frontend setup
- [x] NestJS backend setup
- [x] Initial backend health endpoint
- [x] PostgreSQL integration with Prisma
- [x] Authentication and authorization
- [x] Community and channel management
- [x] Real-time messaging with Socket.IO
- [ ] User presence with Redis (presence is in-memory for now)
- [x] Voice communication with LiveKit
- [ ] Video calls and screen sharing
- [x] Automated tests and CI
- [x] Deployment (Vercel, Render, Neon)

## Project Goals

Through Pulse, the main engineering objectives are:

- Develop full-stack engineering skills.
- Understand real-time communication protocols.
- Build event-driven backend systems.
- Learn WebSocket and WebRTC architecture.
- Implement scalable database and caching solutions.
- Apply software engineering best practices.

## License

This project is currently under development. License details will be added later.

---

**Pulse — Connect. Talk. Share.**
