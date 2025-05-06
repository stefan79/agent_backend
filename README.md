# Agent Backend

A Slack bot integration that connects with a custom React agent and uses an MCP (Model Control Protocol) server for tool loading and execution.

## Project Overview

This project implements a Slack bot that:
- Integrates with Slack using the Bolt framework
- Communicates with a custom React agent
- Utilizes an MCP server for dynamic tool loading and execution
- Built with TypeScript for type safety and better development experience

## Prerequisites

- Node.js (Latest LTS version recommended)
- npm/yarn
- Slack App credentials
- OpenAI API key
- MCP server access

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
PORT=3000
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_SOCKET_TOKEN=your_socket_token
OPENAI_API_KEY=your_openai_api_key
```

## Installation

```bash
npm install
```

## Available Commands

- `npm start`: Run the production build from the dist directory
- `npm run build`: Compile TypeScript to JavaScript
- `npm run dev`: Run development server with hot-reload
- `npm run debug`: Run with debugging enabled
- `npm run lint`: Run ESLint checks
- `npm run lint:fix`: Fix ESLint issues automatically

### Container Commands
- `npm run package`: Build container image using Podman
- `npm run package:run`: Run the containerized application with environment variables
- `npm run package:tag`: Tag the container image for GitHub Container Registry
- `npm run push:login-stefan`: Login to GitHub Container Registry (requires 1Password CLI)

## Dependencies

### Main Dependencies
- `@slack/bolt`: Slack app framework
- `@langchain/core`, `@langchain/community`, `@langchain/openai`: LangChain integration
- `@langchain/mcp-adapters`: MCP server integration
- `dotenv`: Environment variable management
- `typescript`: TypeScript support

### Development Dependencies
- `ts-node-dev`: TypeScript development server
- `eslint`: Code linting
- `@types/node`: TypeScript Node.js types

## Development

Run the development server:
```bash
npm run dev
```

The server will restart automatically when you make changes to the source code.

## Production

Build and run for production:
```bash
npm run build
npm start
```

## Container Deployment

1. Build the container:
```bash
npm run package
```

2. Run the container:
```bash
npm run package:run
```

3. Tag and push to GitHub Container Registry:
```bash
npm run package:tag
# Login to GitHub Container Registry first
npm run push:login-stefan
```
