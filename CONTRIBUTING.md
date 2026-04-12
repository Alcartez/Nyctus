# Contributing to Nyctus

Thank you for your interest in contributing to Nyctus! This document outlines how to set up your development environment, coding standards, and the process for submitting contributions.

## Community Support

- **GitHub Discussions** - Ask questions, share ideas: https://github.com/alcartez/nyctus/discussions
- **Discord** - Join the community: https://discord.gg/5XAjM7w5Cr
- **GitHub Issues** - Report bugs and request features: https://github.com/alcartez/nyctus/issues

## Development Setup

### Prerequisites

- Node.js (with npm)
- Rust toolchain
- Podman or Docker

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nyctus.git
   cd nyctus
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

### Building for Release

```bash
npm run build
npm run tauri build
```

## Code Guidelines

- Run `npm run build` (or `bun run build`) before submitting to catch type errors
- Follow existing code style in the repository
- Use meaningful variable and function names

## Pull Request Process

1. Make your changes in a feature branch (or directly on main for small fixes)
2. Test that the application builds and runs correctly
3. Push to your fork and submit a pull request
4. Describe your changes clearly in the PR description
5. Respond to any feedback from reviewers

## Security

For security vulnerabilities, please do NOT open a public issue. Instead:

1. Check if the vulnerability already exists in GitHub Issues
2. Contact the maintainer directly through Discord or email
3. Provide details about the vulnerability and potential impact

We appreciate responsible disclosure of security issues.

## Recognition

Contributors will be acknowledged in the project (if desired).