<div align="center">
  <h1>DeepChat</h1>
  <p>
    <strong>An under-development AI chat agent interface inspired by ChatGPT and OpenClaw.</strong>
  </p>
  <p>
    DeepChat is a modern, extensible, agent-oriented chat application built with Next.js, React, and TypeScript.
    It is designed for AI conversations, model experimentation, personalized assistant behavior, memory-assisted context,
    code workflows, and a polished local-first chat experience.
  </p>
  <p>
    <img src="https://img.shields.io/badge/status-under%20development-111827?style=for-the-badge" alt="Project status: under development">
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js 16">
    <img src="https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript ready">
  </p>
</div>

<br>

<div align="center">
  <img src="./docs/screenshots/deepchat-home.png" alt="DeepChat home screen with search, suggestion shortcuts, model selector, and message composer" width="100%">
  <p>
    <strong>DeepChat home interface</strong><br>
    A focused AI chat workspace with search, conversation entry points, model controls, and a clean message composer.
  </p>
</div>

<br>

## Overview

DeepChat is an AI chat agent application created for people who want a refined conversational interface with room for experimentation. The project is inspired by the interaction model of ChatGPT and the agent-oriented workflow direction of OpenClaw, while still developing its own structure, interface decisions, and local-first runtime behavior.

The application is currently under active development. The goal is to provide a capable AI chat workspace that feels familiar enough for everyday use, but flexible enough for advanced workflows such as custom model connections, assistant persona tuning, contextual memory, file-assisted conversations, code preview, and agent-style task execution.

DeepChat is not presented as a finished production platform yet. It is a work-in-progress AI chat client and agent interface. The repository is being shaped toward a more complete, stable, and production-ready experience over time.

## Project Description

DeepChat is a Next.js AI chat application for building and testing a modern conversational AI experience. It combines a ChatGPT-inspired user interface with agent-focused capabilities such as model selection, memory references, persona configuration, code-oriented workflows, and local runtime data handling.

The project is intended to become a clean, extensible AI chat agent workspace for developers, makers, researchers, and users who want a more customizable interface for interacting with large language models. DeepChat is suitable as a foundation for experimenting with AI assistants, multi-model chat, prompt behavior, personal context, and workflow-driven conversations.

## Key Positioning

DeepChat is designed around several practical ideas:

- A polished AI chat interface should feel fast, readable, and focused.
- Model experimentation should be accessible without turning the interface into a developer-only control panel.
- Personalization should be explicit, inspectable, and easy to modify.
- Runtime data such as chats, memories, profile settings, file uploads, and API configuration should stay local unless intentionally deployed with a secure storage strategy.
- Agent-style capabilities should be introduced carefully, with clear controls and understandable behavior.
- The project should remain approachable for contributors while still moving toward production-grade structure.

## Screenshot

<table>
  <tr>
    <td width="100%">
      <img src="./docs/screenshots/deepchat-home.png" alt="DeepChat AI chat app screenshot showing the main home interface" width="100%">
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>Main AI Chat Workspace</strong><br>
      The first screen of DeepChat presents a centered conversation entry, guided action shortcuts, a search bar, model selector, and message composer.
    </td>
  </tr>
</table>

## Current Development Status

DeepChat is under development. Features may change, internal APIs may move, and some workflows may be incomplete while the project evolves.

The current codebase already includes important building blocks for an AI chat product:

- A Next.js application structure using the App Router.
- A modern React interface for chat workflows.
- AI model and LLM configuration logic.
- API routes for chat, model listing, verification, memory extraction, and code execution workflows.
- User personalization through persona and memory-related modules.
- Code preview and code runner related utilities.
- Local runtime data directories for chats, user profile, temporary files, and model connection data.

The project is being refined toward a more stable developer and user experience.

## Core Features

### AI Chat Interface

DeepChat provides a focused chat interface for conversational AI usage. The layout is designed to feel familiar to users of modern AI assistants while keeping the workspace clean and direct.

The interface includes:

- A central message composer.
- A model selector.
- Prompt action shortcuts.
- Search entry for chats, messages, and files.
- Conversation-oriented navigation.
- A warning reminder that AI output can be inaccurate and should be verified.

### Agent-Oriented Workflow Direction

DeepChat is inspired by agent-style AI products. The application is being built with the expectation that future workflows may involve deeper tool usage, richer context, and more task-oriented interactions.

The long-term direction includes:

- Better assistant workflow control.
- More structured tool and code execution surfaces.
- More useful memory retrieval.
- Clearer model configuration.
- A stronger separation between user data, runtime state, and source code.

### Model Configuration

The application includes settings and utilities for LLM behavior. DeepChat is designed to support model experimentation and provider-oriented configuration.

Existing model-related areas include:

- Model selection in the chat interface.
- LLM settings for streaming and reasoning behavior.
- Provider-specific handling for reasoning and thinking configuration.
- API routes for model-related actions.

### Persona and Personalization

DeepChat includes persona-related behavior for customizing how the assistant responds. The project supports assistant personalization through local data files that are generated at runtime.

Personalization areas include:

- Custom assistant instructions.
- Tone and response style preferences.
- User profile fields.
- Memory reference preferences.
- Context injection based on relevant saved information.

### Memory and Context

DeepChat includes memory modules that can store and retrieve useful user context. This is designed to make conversations more useful while still keeping the runtime data separate from the repository.

Memory-related behavior includes:

- Saved memory records.
- Chat history references.
- Relevance scoring.
- Context injection for the assistant.
- Runtime-generated memory files.

Memory and chat data are not meant to be committed to the repository.

### Code Workflows

DeepChat includes code-related utilities and API routes for code preview and execution workflows. This direction is intended to support conversations where the assistant can help inspect, generate, and run code-related outputs.

Code-related areas include:

- Code preview utilities.
- Code runner detection.
- Code runner security logic.
- Code execution API routes.
- Session handling for code workflows.

### Local-First Runtime Data

DeepChat keeps runtime data in the `data/` directory. This includes chat history, user settings, memories, temporary files, and API connection data.

For repository safety, only empty folder placeholders should be stored in Git. Real runtime data should remain local, private, or managed through a secure production storage system.

## Technology Stack

<table>
  <tr>
    <th>Layer</th>
    <th>Technology</th>
    <th>Purpose</th>
  </tr>
  <tr>
    <td>Framework</td>
    <td>Next.js 16</td>
    <td>Application routing, API routes, rendering, and production build pipeline.</td>
  </tr>
  <tr>
    <td>UI</td>
    <td>React 19</td>
    <td>Interactive chat interface and client-side application behavior.</td>
  </tr>
  <tr>
    <td>Language</td>
    <td>TypeScript</td>
    <td>Typed application code and safer development workflow.</td>
  </tr>
  <tr>
    <td>Styling</td>
    <td>Tailwind CSS</td>
    <td>Utility-first styling and responsive interface development.</td>
  </tr>
  <tr>
    <td>Motion</td>
    <td>Framer Motion</td>
    <td>Interface transitions and motion behavior.</td>
  </tr>
  <tr>
    <td>Markdown</td>
    <td>React Markdown, Remark GFM, Remark Math, Rehype Katex</td>
    <td>Rich assistant message rendering, GitHub-flavored Markdown, and math output.</td>
  </tr>
  <tr>
    <td>Syntax Highlighting</td>
    <td>Shiki</td>
    <td>High-quality code block rendering.</td>
  </tr>
  <tr>
    <td>AI SDK</td>
    <td>Google GenAI SDK</td>
    <td>AI model integration and Gemini-related workflows.</td>
  </tr>
</table>

## Repository Structure

```text
deepchat/
├── data/
│   ├── chat/
│   ├── llm/
│   │   └── api/
│   ├── temp/
│   │   └── file/
│   └── user/
│       └── memories/
├── docs/
│   └── screenshots/
├── public/
├── src/
│   ├── app/
│   ├── components/
│   └── lib/
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

## Important Data Policy

The `data/` directory is used by the application at runtime. It can contain private, personal, sensitive, or environment-specific files.

Examples of runtime data include:

- Chat conversations.
- Uploaded files.
- Temporary files.
- User profile data.
- User memories.
- Persona settings.
- Model connection data.
- API configuration data.
- Local application state.

These files should not be committed to GitHub. The repository should only include empty folder placeholders so the required directory structure exists without exposing real user data.

Expected committed data structure:

```text
data/.gitkeep
data/chat/.gitkeep
data/llm/.gitkeep
data/llm/api/.gitkeep
data/temp/.gitkeep
data/temp/file/.gitkeep
data/user/.gitkeep
data/user/memories/.gitkeep
```

## Getting Started

### Requirements

Install the following before running DeepChat locally:

- Node.js 20 or newer.
- pnpm.
- A supported operating system for local Next.js development.

### Install Dependencies

```bash
pnpm install
```

### Run the Development Server

```bash
pnpm dev
```

Open the application at:

```text
http://localhost:3000
```

### Build for Production

```bash
pnpm build
```

### Start the Production Server

```bash
pnpm start
```

### Lint the Project

```bash
pnpm lint
```

## Environment Variables

DeepChat may require provider-specific environment variables depending on which AI providers and integrations are enabled.

Sensitive values should be stored in local environment files or deployment platform secrets. Environment files must not be committed to the repository.

Recommended approach:

- Use `.env.local` for local development.
- Use deployment secrets for production.
- Use `.env.example` only for documenting variable names.
- Never commit real API keys, access tokens, private keys, or service credentials.

## Development Notes

DeepChat uses a modern Next.js version with behavior that may differ from older versions of Next.js. Before making framework-level changes, check the installed Next.js documentation inside the project dependencies.

The application currently contains modules for:

- Chat generation.
- Code preview building.
- Code runner detection.
- Code runner security.
- General settings.
- LLM settings.
- MCP settings and runtime behavior.
- Notification settings.
- Tool settings.
- Workflows.
- Persona handling.
- Memory handling.

Because the project is still under development, contributors should expect internal structure to evolve.

## Design Goals

DeepChat aims to become a refined AI chat workspace with a balance of usability, flexibility, and technical clarity.

Primary goals:

- Provide a clean AI chat user experience.
- Support model selection and provider experimentation.
- Offer personalization through persona and memory.
- Keep runtime data separate from source code.
- Support code-oriented assistant workflows.
- Maintain a strong foundation for future agent capabilities.
- Preserve a professional interface suitable for long sessions.
- Keep the project understandable for contributors.

## Non-Goals

DeepChat is not currently intended to be presented as:

- A finished enterprise AI platform.
- A guaranteed secure hosted AI product.
- A drop-in replacement for every commercial AI assistant.
- A fully stable API surface.
- A completed multi-agent operating system.

The project is under development and should be evaluated accordingly.

## Use Cases

DeepChat can be useful for:

- Experimenting with AI chat interfaces.
- Testing model behavior across configurations.
- Building a custom ChatGPT-like application.
- Exploring local-first assistant memory.
- Prototyping AI agent workflows.
- Creating a personal AI chat workspace.
- Developing code-focused assistant features.
- Studying Next.js-based AI application architecture.

## SEO Keywords

DeepChat is relevant to the following search topics:

- AI chat app.
- AI chat agent.
- ChatGPT alternative.
- ChatGPT inspired interface.
- OpenClaw inspired AI app.
- Next.js AI chat application.
- React AI chat interface.
- TypeScript AI assistant.
- Local-first AI chat.
- AI agent workspace.
- AI assistant memory.
- Multi-model AI chat.
- AI code assistant interface.
- Open source AI chat UI.
- Developer AI assistant.

## Roadmap

The roadmap is expected to evolve as the project matures.

Planned or potential improvements include:

- More robust provider management.
- Better onboarding for model setup.
- Stronger memory controls.
- Improved conversation organization.
- Better file handling.
- More complete code preview workflows.
- More reliable code execution boundaries.
- Import and export capabilities.
- Better accessibility coverage.
- More complete settings screens.
- Production-ready deployment documentation.
- Automated testing for core user flows.
- Additional screenshots and documentation assets.
- Clear contribution guidelines.
- Release versioning.

## Security Considerations

DeepChat can interact with AI providers, user-generated content, local files, and runtime data. Treat all runtime data as sensitive unless proven otherwise.

Recommended security practices:

- Do not commit private runtime data.
- Do not commit `.env` files.
- Do not expose API keys in screenshots, logs, issues, or commits.
- Use deployment platform secrets for production configuration.
- Review code execution features carefully before exposing them publicly.
- Validate user inputs and uploaded files before expanding production usage.
- Rotate credentials if they were ever committed or exposed.

## Production Readiness

DeepChat is not yet marked as a final production-ready release. It can be built and tested, but the project is still under active development.

Before using DeepChat in production, review:

- Authentication requirements.
- Authorization requirements.
- AI provider key management.
- Runtime storage design.
- Logging behavior.
- File upload restrictions.
- Code execution restrictions.
- Rate limiting.
- Error handling.
- Monitoring.
- Privacy policy requirements.
- Deployment environment configuration.

## Frequently Asked Questions

### Is DeepChat finished?

No. DeepChat is currently under development. The interface and internals may change.

### Is DeepChat inspired by ChatGPT?

Yes. DeepChat is inspired by the familiar AI chat experience popularized by ChatGPT while aiming to develop its own workflow direction.

### Is DeepChat inspired by OpenClaw?

Yes. DeepChat is also inspired by OpenClaw, especially in the direction of agent-style workflows and a more capable assistant workspace.

### Does DeepChat include real user data in the repository?

No. Runtime data should not be committed. The repository should only include empty placeholder files for the `data/` directory structure.

### Can DeepChat be deployed?

The application can be built with the production build command, but deployment should be reviewed carefully because the project is still under development.

### Can DeepChat support multiple AI providers?

The codebase already contains model and LLM configuration areas, and the architecture is moving toward flexible provider usage. Provider support may evolve over time.

## Contributing

DeepChat is still early, so contribution expectations may change. If you want to contribute, focus on changes that improve stability, clarity, usability, and safety.

Useful contribution areas:

- Interface polish.
- Accessibility improvements.
- Documentation.
- Bug fixes.
- Safer runtime data handling.
- Model configuration improvements.
- Memory workflow improvements.
- Testing.
- Production deployment hardening.

## License

No license has been declared yet. Until a license is added, all rights are reserved by the repository owner.

## GitHub Repository Description

Modern AI chat agent interface inspired by ChatGPT and OpenClaw, built with Next.js, React, and TypeScript. DeepChat is under development and focuses on AI conversations, model experimentation, memory, persona settings, and code workflows.

## Suggested GitHub Topics

```text
ai-chat
ai-agent
chatgpt
chatgpt-alternative
openclaw
nextjs
react
typescript
llm
ai-assistant
agent-interface
local-first
memory
persona
code-assistant
```
