# Contributing to PlusUltra

Thank you for your interest in contributing to PlusUltra! This document provides guidelines and instructions for contributing.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:
- Be respectful and considerate
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 6+
- Docker (for sandbox features)
- Git

### Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/plusultra.git
cd plusultra

# Add upstream remote
git remote add upstream https://github.com/original/plusultra.git
```

### Initial Setup

```bash
# Backend setup
cd plusultra/backend
npm install
cp .env.example .env
# Edit .env with your credentials
npx prisma migrate dev
npx prisma generate

# Frontend setup
cd ../frontend
npm install
cp .env.example .env
```

### Run Development Servers

```bash
# Terminal 1: Backend
cd plusultra/backend
npm run dev
# → http://localhost:3001

# Terminal 2: Frontend
cd plusultra/frontend
npm run dev
# → http://localhost:3000
```

---

## Development Workflow

### 1. Create a Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Branch Naming Convention
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding tests
- `chore/` - Maintenance tasks

### 2. Make Your Changes

- Write clean, readable code
- Follow the coding standards (below)
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Backend
cd plusultra/backend
npm run type-check  # TypeScript compilation
npm run lint        # ESLint
npm test           # Run tests

# Frontend
cd plusultra/frontend
npm run type-check
npm run lint
npm test
```

### 4. Commit Your Changes

Follow the [commit message guidelines](#commit-messages).

```bash
git add .
git commit -m "feat: add intelligent database detection"
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## Coding Standards

### TypeScript

#### Naming Conventions
- **Files**: PascalCase for classes/components (`UserService.ts`), camelCase for utilities (`tokenHelper.ts`)
- **Classes**: PascalCase (`class UserService`)
- **Interfaces/Types**: PascalCase with `I` prefix for interfaces (`interface IUser`)
- **Functions**: camelCase (`function calculateTokens()`)
- **Constants**: SCREAMING_SNAKE_CASE (`const MAX_RETRIES = 3`)
- **Private members**: Prefix with `_` (`private _cache`)

#### Code Style
```typescript
// ✅ Good
export class TokenService {
  private _cache: Map<string, number>;

  constructor(private readonly config: TokenConfig) {
    this._cache = new Map();
  }

  public async calculateTokens(
    feature: string,
    complexity: Complexity
  ): Promise<number> {
    // Implementation
  }
}

// ❌ Avoid
export class tokenservice {
  cache: any;

  CalculateTokens(feature, complexity) {
    // Implementation
  }
}
```

#### Type Safety
- Always use explicit types
- Avoid `any` - use `unknown` if type is truly unknown
- Use strict TypeScript settings
- Prefer interfaces over types for objects
- Use enums for fixed sets of values

```typescript
// ✅ Good
interface IUserRequest {
  userId: string;
  action: UserAction;
}

enum UserAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete'
}

async function handleUser(request: IUserRequest): Promise<IUser> {
  // Implementation
}

// ❌ Avoid
function handleUser(request: any): any {
  // Implementation
}
```

### React/Next.js

#### Component Structure
```typescript
// ✅ Good
'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface IProps {
  title: string;
  onSubmit: (data: string) => void;
}

export function MyComponent({ title, onSubmit }: IProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    onSubmit(value);
  }, [value, onSubmit]);

  return (
    <div className="p-4">
      <h2>{title}</h2>
      <Button onClick={handleSubmit}>Submit</Button>
    </div>
  );
}
```

#### Hooks
- Use built-in hooks appropriately
- Create custom hooks for reusable logic
- Prefix custom hooks with `use`
- Follow hooks rules (don't call conditionally)

### API Routes

```typescript
// ✅ Good structure
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const requestSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['create', 'update', 'delete'])
});

type RequestType = z.infer<typeof requestSchema>;

export async function handleRequest(
  request: FastifyRequest<{ Body: RequestType }>,
  reply: FastifyReply
) {
  try {
    const validated = requestSchema.parse(request.body);

    // Business logic
    const result = await processRequest(validated);

    return reply.status(200).send({
      success: true,
      data: result
    });
  } catch (error) {
    return reply.status(400).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
```

### Error Handling

```typescript
// ✅ Good
class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

try {
  await riskyOperation();
} catch (error) {
  if (error instanceof ServiceError) {
    // Handle known error
    logger.error(`Service error: ${error.code}`, { error });
  } else if (error instanceof Error) {
    // Handle generic error
    logger.error(`Unexpected error: ${error.message}`, { error });
  } else {
    // Handle unknown error
    logger.error('Unknown error occurred', { error });
  }
  throw error;
}
```

---

## Testing Guidelines

### Unit Tests

```typescript
// example.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { TokenService } from './TokenService';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService(mockConfig);
  });

  it('should calculate tokens correctly', async () => {
    const result = await service.calculateTokens('small-app', 'low');
    expect(result).toBe(100);
  });

  it('should throw error for invalid feature', async () => {
    await expect(
      service.calculateTokens('invalid', 'low')
    ).rejects.toThrow('Invalid feature');
  });
});
```

### Integration Tests

```typescript
// integration.test.ts
import { FastifyInstance } from 'fastify';
import { buildServer } from './server';

describe('API Integration', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should return 200 for health check', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
  });
});
```

### Test Coverage

- Aim for 80%+ code coverage
- Focus on critical paths first
- Test edge cases and error conditions
- Don't test external libraries

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```
feat(backend): add intelligent database detection

Implemented AI-powered backend feature detection that analyzes user
intent and suggests appropriate database solutions (Supabase, Firebase, AWS).

Closes #123
```

```
fix(frontend): resolve Monaco editor sync issue

Fixed race condition in WebSocket message handling that caused
editor state to desync during rapid updates.

Fixes #456
```

```
docs(readme): update deployment instructions

Added Docker deployment section and updated environment variable
documentation.
```

---

## Pull Request Process

### Before Submitting

1. ✅ All tests pass
2. ✅ No TypeScript errors
3. ✅ No linting errors
4. ✅ Code follows style guidelines
5. ✅ Documentation updated
6. ✅ Commit messages follow convention

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested these changes.

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing unit tests pass locally
```

### Review Process

1. Submit PR with clear description
2. Address automated checks (CI/CD)
3. Respond to reviewer feedback
4. Make requested changes
5. Get approval from maintainer
6. PR will be merged

### After Merge

```bash
# Update your local main branch
git checkout main
git pull upstream main

# Delete your feature branch
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

---

## Questions?

- Check existing [Issues](https://github.com/your-org/plusultra/issues)
- Join our [Discussions](https://github.com/your-org/plusultra/discussions)
- Contact maintainers

---

**Thank you for contributing to PlusUltra!** 🚀
