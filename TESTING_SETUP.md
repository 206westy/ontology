# Testing Setup Guide: Vitest + Playwright for Next.js 15

Complete testing configuration guide for baive coding (AI agent that writes and runs tests) in Next.js 15 (App Router) + React 19 projects.

**Documentation Last Updated:** February 2026
**Vitest Version:** 4.0.7+
**Playwright Version:** 1.51.0+

---

## Part 1: Vitest + React Testing Library Setup

### 1.1 Installation

Run from the `ontology/` directory:

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
```

**Why these packages:**
- `vitest`: Next-generation Jest-compatible testing framework powered by Vite
- `@vitejs/plugin-react`: React JSX and refresh support for Vite
- `jsdom`: DOM environment simulation for component tests
- `@testing-library/react`: React component testing utilities
- `@testing-library/dom`: DOM query utilities
- `vite-tsconfig-paths`: TypeScript path alias resolution

### 1.2 Configuration: `vitest.config.mts`

Create `ontology/vitest.config.mts` in the project root:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Enable globals (describe, test, expect without imports)
    globals: true,

    // Browser environment for component testing
    environment: 'jsdom',

    // Setup files to run before tests
    setupFiles: ['./vitest.setup.ts'],

    // File patterns
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**'],
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Disable mocks isolation between tests (for server components)
    isolate: false,
  },
})
```

### 1.3 Setup File: `vitest.setup.ts`

Create `ontology/vitest.setup.ts` to configure testing environment:

```typescript
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Next.js router (if needed)
vi.mock('next/router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Suppress specific console warnings in tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
```

### 1.4 Update `package.json`

Add test scripts to `ontology/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Part 2: Test Examples for Next.js 15

### 2.1 Client Component Test

**File:** `ontology/src/components/ui/__tests__/button.test.tsx`

```typescript
'use client'

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'

describe('Button Component', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeDefined()
  })

  it('calls onClick handler when clicked', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    const button = screen.getByRole('button')
    await userEvent.click(button)

    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('disables button when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies variant classes correctly', () => {
    render(<Button variant="destructive">Delete</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('destructive')
  })
})
```

### 2.2 Zustand Store Test

**File:** `ontology/src/hooks/__tests__/useOntologyStore.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOntologyStore } from '../useOntologyStore'

describe('useOntologyStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useOntologyStore.setState({
      nodes: [],
      edges: [],
      classes: {},
    })
  })

  it('adds a node to the store', () => {
    const { result } = renderHook(() => useOntologyStore())

    act(() => {
      result.current.addNode({
        id: 'node-1',
        data: { label: 'Test Node' },
        position: { x: 0, y: 0 },
      })
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].id).toBe('node-1')
  })

  it('updates node data', () => {
    const { result } = renderHook(() => useOntologyStore())

    act(() => {
      result.current.addNode({
        id: 'node-1',
        data: { label: 'Original' },
        position: { x: 0, y: 0 },
      })
      result.current.updateNodeData('node-1', { label: 'Updated' })
    })

    const node = result.current.nodes[0]
    expect(node.data.label).toBe('Updated')
  })

  it('removes a node from the store', () => {
    const { result } = renderHook(() => useOntologyStore())

    act(() => {
      result.current.addNode({
        id: 'node-1',
        data: { label: 'Test' },
        position: { x: 0, y: 0 },
      })
      result.current.removeNode('node-1')
    })

    expect(result.current.nodes).toHaveLength(0)
  })

  it('creates a connection between nodes', () => {
    const { result } = renderHook(() => useOntologyStore())

    act(() => {
      result.current.addNode({
        id: 'node-1',
        data: { label: 'Class A' },
        position: { x: 0, y: 0 },
      })
      result.current.addNode({
        id: 'node-2',
        data: { label: 'Class B' },
        position: { x: 100, y: 0 },
      })
      result.current.addEdge({
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        data: { type: 'inheritance' },
      })
    })

    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0].source).toBe('node-1')
  })
})
```

### 2.3 API Route Handler Test

**File:** `ontology/src/app/api/__tests__/classify.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from '../classify/route'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      insert: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    })),
  },
}))

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAI: class {
    chat = {
      completions = {
        create: vi.fn(() =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    classes: [{ name: 'Person', properties: [] }],
                  }),
                },
              },
            ],
          })
        ),
      }
    }
  }
}))

describe('POST /api/classify', () => {
  it('classifies text and returns structured ontology', async () => {
    const request = new Request('http://localhost:3000/api/classify', {
      method: 'POST',
      body: JSON.stringify({
        text: 'John is a software engineer',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('classes')
  })

  it('returns 400 for missing text', async () => {
    const request = new Request('http://localhost:3000/api/classify', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

### 2.4 React Query Hook Test

**File:** `ontology/src/features/explorer/__tests__/useOntologyClasses.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOntologyClasses } from '../hooks'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useOntologyClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches classes successfully', async () => {
    const { result } = renderHook(() => useOntologyClasses(), {
      wrapper: createWrapper(),
    })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // Wait for data
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
  })

  it('handles error state', async () => {
    // Mock API to return error
    vi.mock('@/features/explorer/api', () => ({
      fetchClasses: vi.fn(() => Promise.reject(new Error('API Error'))),
    }))

    const { result } = renderHook(() => useOntologyClasses(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeDefined()
  })
})
```

---

## Part 3: Playwright E2E Testing Setup

### 3.1 Installation

```bash
npm install -D @playwright/test
```

### 3.2 Configuration: `playwright.config.ts`

Create `ontology/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:3000'

export default defineConfig({
  // Test directory and patterns
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  // Retries and workers
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Global timeout (30 seconds per test)
  timeout: 30000,

  // Reporter configuration
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit.xml' }],
  ],

  // Shared settings for all tests
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5000,
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile testing
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // Start dev server before tests
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
```

### 3.3 Update `package.json`

Add E2E test scripts:

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:debug": "playwright test --debug",
    "e2e:codegen": "playwright codegen http://localhost:3000"
  }
}
```

---

## Part 4: Playwright E2E Test Examples

### 4.1 Navigation and Basic Interactions

**File:** `ontology/tests/e2e/navigation.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('should navigate between pages', async ({ page }) => {
    // Start on home page
    await page.goto('/')
    expect(await page.title()).toContain('Ontology')

    // Check home page content
    await expect(page.locator('h1')).toContainText('Ontology Studio')
  })

  test('should navigate to about page', async ({ page }) => {
    await page.goto('/')

    // Click About link
    await page.click('a:has-text("About")')

    // Verify URL changed
    await expect(page).toHaveURL('/about')

    // Verify page content
    await expect(page.locator('h1')).toContainText('About')
  })
})
```

### 4.2 Form Interaction and Submission

**File:** `ontology/tests/e2e/forms.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Ontology Creation Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ontologies/new')
  })

  test('should submit form with valid data', async ({ page }) => {
    // Fill in form fields
    await page.fill('input[name="title"]', 'My Ontology')
    await page.fill('textarea[name="description"]', 'A test ontology')

    // Select from dropdown
    await page.click('select[name="domain"]')
    await page.click('option:has-text("Healthcare")')

    // Submit form
    await page.click('button:has-text("Create")')

    // Wait for navigation and verify success
    await expect(page).toHaveURL(/\/ontologies\/[a-z0-9-]+/)
    await expect(page.locator('text=Ontology created successfully')).toBeVisible()
  })

  test('should show validation errors', async ({ page }) => {
    // Try to submit empty form
    await page.click('button:has-text("Create")')

    // Verify error messages
    await expect(page.locator('text=Title is required')).toBeVisible()
  })
})
```

### 4.3 Canvas/Graph Interaction

**File:** `ontology/tests/e2e/canvas.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Canvas - Graph Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/123')
    // Wait for canvas to load
    await page.waitForSelector('[data-testid="canvas"]')
  })

  test('should add nodes to canvas', async ({ page }) => {
    const canvas = page.locator('[data-testid="canvas"]')

    // Get canvas position
    const boundingBox = await canvas.boundingBox()
    if (!boundingBox) throw new Error('Canvas not found')

    // Click to add node
    await page.click('[data-testid="add-node-button"]')
    await page.fill('input[placeholder="Node name"]', 'Person')
    await page.press('input', 'Enter')

    // Verify node appears
    await expect(page.locator('text=Person')).toBeVisible()
  })

  test('should create connections between nodes', async ({ page }) => {
    // Assume nodes already exist
    const node1 = page.locator('[data-testid="node-Person"]')
    const node2 = page.locator('[data-testid="node-Company"]')

    // Drag from node1 to node2
    await node1.hover()
    await page.mouse.move(
      (await node1.boundingBox())!.x + 50,
      (await node1.boundingBox())!.y + 50
    )
    await page.mouse.down()

    await node2.hover()
    await page.mouse.up()

    // Verify connection created
    await expect(page.locator('[data-testid="edge-Person-Company"]')).toBeVisible()
  })
})
```

### 4.4 Authentication Flow Test

**File:** `ontology/tests/e2e/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button:has-text("Sign In")')

    // Wait for redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('text=Welcome back')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button:has-text("Sign In")')

    await expect(page.locator('text=Invalid credentials')).toBeVisible()
  })

  test('should logout user', async ({ page, context }) => {
    // Assume already logged in (set auth cookie)
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'valid_token',
        domain: 'localhost',
        path: '/',
      },
    ])

    await page.goto('/dashboard')
    await page.click('[data-testid="user-menu"]')
    await page.click('button:has-text("Sign Out")')

    await expect(page).toHaveURL('/login')
  })
})
```

### 4.5 API Mocking with Playwright

**File:** `ontology/tests/e2e/api-mocking.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('API Mocking', () => {
  test('should use mocked API responses', async ({ page }) => {
    // Mock API endpoint
    await page.route('**/api/classes', (route) => {
      route.abort('blockedbyclient')
    })

    await page.goto('/')

    // Fill form
    await page.fill('textarea[name="freeText"]', 'User is a person who uses the system')
    await page.click('button:has-text("Classify")')

    // Intercept and mock the response
    await page.route('**/api/classify', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          classes: [
            {
              name: 'User',
              properties: [{ name: 'name', type: 'string' }],
            },
            {
              name: 'Person',
              properties: [{ name: 'age', type: 'number' }],
            },
          ],
        }),
      })
    })

    // Verify mocked data appears
    await expect(page.locator('text=User')).toBeVisible()
    await expect(page.locator('text=Person')).toBeVisible()
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/classify', (route) => {
      route.abort('failed')
    })

    await page.goto('/')
    await page.fill('textarea[name="freeText"]', 'Some text')
    await page.click('button:has-text("Classify")')

    // Verify error message
    await expect(page.locator('text=Failed to classify')).toBeVisible()
  })
})
```

---

## Part 5: Running Tests with Claude Code Hooks

### 5.1 Configure Auto-Test on Save

Create `.claude/hooks.json` to automatically run tests when files change:

```json
{
  "onFileSave": {
    "enabled": true,
    "commands": [
      {
        "match": "src/**/*.{ts,tsx}",
        "command": "npm run test:run -- --run \"${filePath}\"",
        "description": "Run Vitest for changed file"
      },
      {
        "match": "tests/e2e/**/*.spec.ts",
        "command": "npx playwright test \"${filePath}\"",
        "description": "Run Playwright test for changed file"
      }
    ]
  }
}
```

### 5.2 Test Execution Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | Watch mode (unit/component tests) |
| `npm run test:run` | Single run (CI mode) |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:ui` | Vitest UI dashboard |
| `npm run e2e` | Run all E2E tests |
| `npm run e2e:ui` | Playwright UI mode (visual editor) |
| `npm run e2e:debug` | Debug specific test |
| `npm run e2e:codegen` | Record new test interactively |

---

## Part 6: Best Practices for Baive Coding

### 6.1 Test-Driven Development (TDD) Flow

1. **AI writes failing test** → `npm run test -- --watch`
2. **Developer implements** → Tests pass automatically
3. **AI writes E2E test** → `npm run e2e`
4. **Verify full integration** → Code ready

### 6.2 Test File Organization

```
ontology/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   └── __tests__/
│   │   │       └── button.test.tsx
│   │   └── explorer/
│   │       ├── Explorer.tsx
│   │       └── __tests__/
│   │           └── Explorer.test.tsx
│   ├── features/
│   │   ├── classify/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   └── __tests__/
│   │   │       ├── api.test.ts
│   │   │       └── hooks.test.ts
│   └── app/
│       └── api/
│           └── __tests__/
│               └── route.test.ts
└── tests/
    └── e2e/
        ├── navigation.spec.ts
        ├── forms.spec.ts
        ├── canvas.spec.ts
        ├── auth.spec.ts
        └── fixtures/
            └── auth.ts
```

### 6.3 Mock Data and Fixtures

Create `ontology/tests/fixtures/ontology.ts`:

```typescript
export const mockOntologyData = {
  classes: [
    {
      id: 'class-person',
      name: 'Person',
      properties: [
        { id: 'prop-name', name: 'name', type: 'string' },
        { id: 'prop-age', name: 'age', type: 'number' },
      ],
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'class-person',
      target: 'class-organization',
      label: 'works_at',
    },
  ],
}

export const mockApiResponse = {
  success: true,
  data: mockOntologyData,
}
```

### 6.4 Testing Async Server Components

Since Vitest doesn't support async Server Components, use E2E tests:

```typescript
// ❌ Won't work in Vitest
test('async server component', async () => {
  render(<AsyncServerComponent />)
  await waitFor(() => expect(...).toBe(...))
})

// ✅ Use Playwright E2E instead
test('should display data from server component', async ({ page }) => {
  await page.goto('/page-with-server-component')
  await expect(page.locator('text=Data loaded')).toBeVisible()
})
```

### 6.5 Data Attributes for Testing

Add `data-testid` to components for reliable E2E selectors:

```tsx
// src/components/OntologyCanvas.tsx
export function OntologyCanvas() {
  return (
    <div data-testid="canvas">
      <button data-testid="add-node-button">Add Node</button>
      <div data-testid="node-Person">Person</div>
    </div>
  )
}
```

---

## Part 7: CI/CD Integration

### 7.1 GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:run
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install-deps
      - run: npm run build
      - run: npm run e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## References

- **Next.js Testing Guide:** https://nextjs.org/docs/app/guides/testing
- **Vitest Documentation:** https://vitest.dev/guide/
- **React Testing Library:** https://testing-library.com/docs/react-testing-library/intro/
- **Playwright Documentation:** https://playwright.dev/docs/intro
- **Next.js with Vitest Example:** https://github.com/vercel/next.js/tree/canary/examples/with-vitest
- **Next.js with Playwright Example:** https://github.com/vercel/next.js/tree/canary/examples/with-playwright

---

## Summary

| Layer | Tool | Purpose |
|-------|------|---------|
| **Unit Tests** | Vitest + React Testing Library | Test components, hooks, utilities in jsdom |
| **Integration Tests** | Vitest + React Query setup | Test store interactions, API calls |
| **E2E Tests** | Playwright | Test full user flows in real browser |
| **Auto-Test** | Claude Code Hooks | Run tests on file save during development |

This setup enables **baive coding** — AI agents can write tests in watch mode, verify implementations pass tests, and maintain high code quality throughout development.
