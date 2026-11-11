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

### Planned Features

- [ ] User registration and authentication
- [ ] Community and server management
- [ ] Text channels and messaging
- [ ] Real-time message delivery
- [ ] Online, offline and idle presence
- [ ] Friend system and direct messages
- [ ] Voice communication
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
git clone YOUR_REPOSITORY_URL
cd pulse
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create your backend environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Configure your local environment variables as needed.

### 4. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis.

### 5. Start the backend

```bash
npm run dev:api
```

Backend: `http://localhost:4000`

Health endpoint: `http://localhost:4000/health`

### 6. Start the frontend

Open another terminal:

```bash
npm run dev:web
```

Frontend: `http://localhost:3000`

## Development Roadmap

- [x] Initial monorepo structure
- [x] Next.js frontend setup
- [x] NestJS backend setup
- [x] Initial backend health endpoint
- [ ] PostgreSQL integration with Prisma
- [ ] Authentication and authorization
- [ ] Community and channel management
- [ ] Real-time messaging with Socket.IO
- [ ] User presence with Redis
- [ ] Voice communication with LiveKit
- [ ] Video calls and screen sharing
- [ ] Testing and deployment

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
