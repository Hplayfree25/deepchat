# DeepChat

<div align="center">

![Project Status](https://img.shields.io/badge/status-under%20development-111827?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16.2.4-000000?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19.2.4-087EA4?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.x-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-ready-F69220?style=flat-square&logo=pnpm&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-16A34A?style=flat-square)

**An under-development AI chat agent interface inspired by ChatGPT and OpenClaw.**

DeepChat is a modern, extensible, agent-oriented chat application built with Next.js, React, and TypeScript. It is designed for AI conversations, model experimentation, personalized assistant behavior, memory-assisted context, code workflows, and a polished local-first chat experience.

</div>

## Overview

DeepChat is an AI chat agent application created for people who want a refined conversational interface with room for experimentation. The project is inspired by the interaction model of ChatGPT and the agent-oriented workflow direction of OpenClaw, while still developing its own structure, interface decisions, and local-first runtime behavior.

The application is currently under active development. The goal is to provide a capable AI chat workspace that feels familiar enough for everyday use, but flexible enough for advanced workflows such as custom model connections, assistant persona tuning, contextual memory, file-assisted conversations, code preview, and agent-style task execution.

DeepChat is not presented as a finished production platform yet. It is a work-in-progress AI chat client and agent interface. The repository is being shaped toward a more complete, stable, and production-ready experience over time.

## Project Description

DeepChat is a Next.js AI chat application for building and testing a modern conversational AI experience. It combines a ChatGPT-inspired user interface with agent-focused capabilities such as model selection, memory references, persona configuration, code-oriented workflows, and local runtime data handling.

The project is intended to become a clean, extensible AI chat agent workspace for developers, makers, researchers, and users who want a more customizable interface for interacting with large language models. DeepChat is suitable as a foundation for experimenting with AI assistants, multi-model chat, prompt behavior, personal context, and workflow-driven conversations.

## Screenshots

### 1. Home Screen

![DeepChat light theme home screen](./docs/screenshots/deepchat-home.png)

### 2. Chat Screen

![DeepChat light theme chat screen](./docs/screenshots/deepchat-chat.png)

## Technical Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | Next.js 16.2.4 | App Router, server actions, API routes, production build pipeline |
| Runtime UI | React 19.2.4 | Interactive chat workspace, composer state, panels, settings modal |
| Language | TypeScript 5.x | Typed application contracts and safer refactoring |
| Styling | Tailwind CSS 4 | Responsive interface styling and theme-aware surfaces |
| Persistence | SQLite via better-sqlite3 | Local chat, message, memory, attachment, and shared snapshot storage |
| ORM | Drizzle ORM | Database schema and typed database access layer support |
| AI Provider SDK | Google GenAI SDK | Gemini-oriented model and generation workflows |
| Markdown | react-markdown, remark-gfm, remark-math, rehype-katex | Rich assistant output, GFM, and math rendering |
| Code Rendering | Shiki | Syntax highlighting for generated code blocks |
| Motion | Framer Motion | Interface transitions and lightweight interaction polish |

## Core Capabilities

- ChatGPT-inspired home screen, chat view, sidebar, right panel, and reusable composer.
- Model selection and provider configuration for LLM experimentation.
- Local-first data handling for chats, user profile, memories, temporary files, and API connection metadata.
- Persona and memory modules for personalized assistant behavior.
- Markdown, math, and syntax-highlighted code response rendering.
- Code workflow utilities for preview, runner detection, runner security, and execution API routes.
- API routes for chat generation, model listing, verification, memory extraction, code preview, code run, and code sessions.
- Settings surfaces for general preferences, profile, personality, connections, notifications, MCP, tools, agent behavior, and data controls.

## Repository Structure

```text
deepchat/
+-- data/
|   +-- chat/
|   +-- llm/
|   +-- temp/
|   +-- user/
+-- docs/
|   +-- screenshots/
+-- public/
+-- scripts/
+-- src/
|   +-- app/
|   +-- components/
|   +-- lib/
+-- package.json
+-- next.config.ts
+-- tsconfig.json
+-- README.md
```

## Installation

Use Node.js 20 or newer and pnpm.

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

## Production Commands

Create a production build:

```bash
pnpm build
```

Start the production server:

```bash
pnpm start
```

Run linting:

```bash
pnpm lint
```

## Runtime Data

DeepChat stores runtime data under `data/`. This directory can contain private chats, uploaded files, memories, profile data, model connection metadata, logs, SQLite files, and temporary artifacts.

Keep runtime data out of Git. Use local files for development and deployment secrets or managed storage for production environments.

## Environment

Provider credentials should be stored in local environment files or deployment secrets. Do not commit API keys, tokens, private keys, local database files, chat exports, uploaded documents, or generated runtime state.

Recommended local file:

```text
.env.local
```

## Production Notes

Before deploying DeepChat publicly, review authentication, authorization, rate limiting, provider key storage, database persistence, file upload boundaries, code execution safeguards, logging policy, backup strategy, and privacy requirements.

The app can be built with `pnpm build`, but the project status remains under development.

## GitHub Repository Description

Modern AI chat agent interface inspired by ChatGPT and OpenClaw, built with Next.js, React, TypeScript, SQLite, memory-assisted context, model configuration, and code workflow tooling.

## Suggested Topics

```text
ai-chat
ai-agent
chatgpt-inspired
openclaw-inspired
nextjs
react
typescript
llm
local-first
memory
persona
code-assistant
sqlite
tailwindcss
```

## License

DeepChat is licensed under the MIT License. See [LICENSE](./LICENSE).
