# Coding Standards and Patterns

This document outlines the coding structure, patterns, and conventions used in this project to ensure consistency across all future changes.

## Project Architecture

### Tech Stack
- **Frontend**: React 18.3 with TypeScript, Wouter for routing, TanStack Query for data fetching
- **Backend**: Express.js with TypeScript, Neon PostgreSQL via Drizzle ORM
- **UI**: Radix UI components with Tailwind CSS, shadcn/ui pattern
- **Build**: Vite for development, esbuild for production
- **Deployment**: Replit with autoscale deployment

### Directory Structure
```
/
├── client/src/          # Frontend React application
│   ├── components/      # Reusable UI components
│   │   └── ui/         # shadcn/ui base components
│   ├── pages/          # Route page components
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utilities and context providers
├── server/              # Backend Express API
│   ├── routes.ts       # API route definitions
│   ├── storage.ts      # Database access layer
│   ├── sleeper.ts      # External API integrations
│   └── db.ts           # Database connection
├── shared/              # Shared TypeScript types and schemas
│   └── schema.ts       # Drizzle schemas + Zod validation
└── script/              # Build scripts
```

## Frontend Patterns

### Component Structure

#### Import Order
1. React hooks first (`useState`, `useEffect`, etc.)
2. Third-party libraries (wouter, tanstack)
3. Context providers (`useSleeper`, etc.)
4. UI components (grouped by source: `@/components/ui`, `@/components`)
5. Icons from `lucide-react`
6. Types from `@shared/schema`
7. Local utilities last

Example:
```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Clock } from "lucide-react";
import type { RuleSuggestion } from "@shared/schema";
```

#### Page Components Pattern
```typescript
export default function PageName() {
  const { user, league } = useSleeper();
  const { toast } = useToast();
  
  // Queries with useQuery
  const { data, isLoading } = useQuery({...});
  
  // Mutations with useMutation
  const mutation = useMutation({...});
  
  // Local state with useState
  const [localState, setLocalState] = useState();
  
  // Early returns for loading/error states
  if (isLoading) return <Skeleton />;
  if (!league) return <NoLeagueMessage />;
  
  // Main JSX return
  return (
    <div className="container mx-auto p-4">
      {/* Content */}
    </div>
  );
}
```

### Data Fetching

#### Query Pattern
- Use `@tanstack/react-query` for all API calls
- Query keys: `["/api/...", params...]` matching URL structure
- Always check `enabled` condition based on required data
- Use `queryClient.invalidateQueries()` after mutations

```typescript
const { data, isLoading } = useQuery({
  queryKey: ["/api/league", league?.leagueId, "resource", param],
  queryFn: async () => {
    const res = await fetch(`/api/league/${league?.leagueId}/resource?param=${param}`);
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  },
  enabled: !!league?.leagueId && !!param,
});
```

#### Mutation Pattern
```typescript
const mutation = useMutation({
  mutationFn: async (data) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed");
    }
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "resource"] });
    toast({
      title: "Success",
      description: "Operation completed successfully.",
    });
  },
  onError: (error: Error) => {
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  },
});
```

### Error Handling

#### Frontend
- Use toast notifications for user feedback
- Query errors handled by React Query error boundaries
- Always provide user-friendly error messages

#### Backend
- Always wrap routes in try-catch
- Return appropriate HTTP status codes (400, 404, 500)
- Log errors with `console.error()` and descriptive messages
- Return JSON: `{ error: "message" }` for errors

### Type Safety
- Define interfaces at top of file or in `shared/schema.ts`
- Use Zod schemas for runtime validation
- Import types from `@shared/schema` when available
- Use TypeScript strict mode

### Styling Conventions

#### Tailwind CSS
- Use utility classes exclusively
- Use `cn()` utility for conditional classes: `cn("base-class", condition && "conditional-class")`
- Consistent spacing: Tailwind spacing scale (2, 4, 6, 8, 12, 16, 20, 24)

#### Typography
- Headings: `font-heading` class (Poppins)
- Body: Default Inter font
- Numbers: `tabular-nums` for alignment
- Sizes: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`

#### Colors
- Use theme variables: `bg-primary`, `text-muted-foreground`, `border-border`
- Avoid hardcoded colors
- Use semantic color names: `destructive`, `muted`, `accent`

### UI Component Patterns

#### Cards
```typescript
<Card>
  <CardHeader>
    <CardTitle className="font-heading text-lg">Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

#### Forms
```typescript
<div className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="field">Label</Label>
    <Input id="field" value={value} onChange={(e) => setValue(e.target.value)} />
  </div>
  <Button onClick={handleSubmit} disabled={isPending}>
    Submit
  </Button>
</div>
```

#### Loading States
```typescript
{isLoading ? (
  <Skeleton className="h-48 w-full" />
) : (
  <Content />
)}
```

#### Empty States
```typescript
<Card>
  <CardContent className="py-12 text-center">
    <Icon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
    <p className="text-lg font-medium mb-2">No items</p>
    <p className="text-muted-foreground">Description message</p>
  </CardContent>
</Card>
```

## Backend Patterns

### API Route Structure
```typescript
app.get("/api/resource/:id", async (req, res) => {
  try {
    // 1. Extract and validate parameters
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Missing required parameter" });
    }
    
    // 2. Fetch data via storage
    const data = await storage.getResource(id);
    
    // 3. Format response
    res.json(data);
  } catch (error) {
    console.error("Error fetching resource:", error);
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});
```

### POST Route Pattern
```typescript
app.post("/api/resource", async (req, res) => {
  try {
    // 1. Validate required fields
    const { field1, field2 } = req.body;
    if (!field1 || !field2) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // 2. Validate data types/ranges
    if (typeof field1 !== "string" || field1.length === 0) {
      return res.status(400).json({ error: "Invalid field1" });
    }
    
    // 3. Create via storage
    const result = await storage.createResource({ field1, field2 });
    
    // 4. Return result
    res.json(result);
  } catch (error) {
    console.error("Error creating resource:", error);
    res.status(500).json({ error: "Failed to create resource" });
  }
});
```

### Error Handling
- Always wrap in try-catch
- Return appropriate HTTP status codes:
  - `400` - Bad Request (validation errors)
  - `404` - Not Found (resource doesn't exist)
  - `403` - Forbidden (permission denied)
  - `500` - Internal Server Error (unexpected errors)
- Log errors with `console.error()` and descriptive messages
- Return JSON: `{ error: "User-friendly message" }` for errors

### Validation
- Check required fields early: `if (!field) return res.status(400).json({ error: "Missing field" })`
- Validate types and ranges before processing
- Use Zod schemas from `@shared/schema` for complex validation
- Return specific error messages for debugging

### Database Access
- All database operations go through `storage` object
- Storage methods return typed data from `@shared/schema`
- Use Drizzle ORM query builders (`eq`, `and`, `desc`, etc.)
- Always use transactions for multi-step operations

### Storage Layer Pattern
```typescript
async methodName(params: ParamsType): Promise<ReturnType> {
  // 1. Check for existing records if needed
  const existing = await this.getExistingRecord(params);
  if (existing) {
    // Handle existing case
  }
  
  // 2. Generate ID with randomUUID()
  const id = randomUUID();
  
  // 3. Create timestamp with Date.now()
  const createdAt = Date.now();
  
  // 4. Insert/update via db
  await db.insert(table).values({ id, ...data, createdAt });
  
  // 5. Return formatted result matching schema type
  return {
    id,
    ...data,
    createdAt,
  };
}
```

## Database Connection Pattern (Replit/Neon PostgreSQL)

### Overview

This project uses **Neon Serverless PostgreSQL** with **Drizzle ORM** for database connections. The connection pattern is designed specifically for Replit's serverless environment and must be followed for all database operations.

### 1. Database Connection Setup

**File**: `server/db.ts`

The database connection is established in a single file that exports a shared `db` instance:

```typescript
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configure WebSocket for Neon compatibility (required for Replit)
neonConfig.webSocketConstructor = ws;

// Validate DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Export single db instance for use throughout application
export const db = drizzle(pool);
```

**Key Points**:
- **Single connection file**: All database connections go through `server/db.ts`
- **Environment variable**: Requires `DATABASE_URL` (automatically provided by Replit when database is provisioned)
- **Neon Serverless**: Uses `@neondatabase/serverless` package for serverless compatibility
- **WebSocket configuration**: Required for Neon to work in Replit environment
- **Connection pooling**: Uses `Pool` for efficient connection management
- **Single export**: Only one `db` instance is created and exported

### 2. Drizzle Configuration

**File**: `drizzle.config.ts`

Drizzle Kit configuration for schema management and migrations:

```typescript
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

**Key Points**:
- Points to `shared/schema.ts` for all table definitions
- Uses `DATABASE_URL` environment variable
- PostgreSQL dialect
- Migrations output to `./migrations` directory

### 3. Schema Definition Pattern

**File**: `shared/schema.ts`

All database tables are defined in a single centralized schema file:

```typescript
import { z } from "zod";
import { pgTable, text, integer, bigint, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// 1. Table Definition
export const ruleSuggestionsTable = pgTable("rule_suggestions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  authorId: varchar("author_id", { length: 64 }).notNull(),
  authorName: varchar("author_name", { length: 128 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// 2. Zod Schema for API Validation
export const ruleSuggestionSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  rosterId: z.number(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  createdAt: z.number(),
});

// 3. Insert Schema (omits auto-generated fields)
export const insertRuleSuggestionDbSchema = createInsertSchema(ruleSuggestionsTable)
  .omit({ id: true, createdAt: true, status: true });

// 4. Type Exports
export type RuleSuggestion = z.infer<typeof ruleSuggestionSchema>;
export type InsertRuleSuggestion = z.infer<typeof insertRuleSuggestionDbSchema>;
```

**Key Points**:
- **Centralized**: All tables in one file (`shared/schema.ts`)
- **Drizzle `pgTable`**: Use `pgTable` from `drizzle-orm/pg-core`
- **Zod validation**: Include Zod schemas for API validation
- **Field Types**:
  - Primary keys: `varchar("id", { length: 36 })` with UUID
  - Foreign keys: Match referenced table types
  - Timestamps: `bigint("created_at", { mode: "number" })` storing `Date.now()`
  - Status fields: `varchar("status", { length: 16 })` with enum values
  - Text fields: `text("description")` for long text, `varchar("name", { length: 128 })` for short text
  - Numbers: `integer("count")` for whole numbers
- **Insert schemas**: Use `createInsertSchema().omit(...)` to exclude auto-generated fields
- **Type exports**: Export both select and insert types

### 4. Storage Layer Pattern

**File**: `server/storage.ts`

All database operations are abstracted through a storage layer:

```typescript
import { randomUUID } from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";  // Import from single source
import {
  ruleSuggestionsTable,  // Import tables from schema
  // ... other tables
} from "@shared/schema";
import type { 
  RuleSuggestion, 
  InsertRuleSuggestion,
  // ... other types
} from "@shared/schema";

export class DatabaseStorage implements IStorage {
  // GET operation example
  async getRuleSuggestions(leagueId: string): Promise<RuleSuggestion[]> {
    try {
      const rows = await db
        .select()
        .from(ruleSuggestionsTable)
        .where(eq(ruleSuggestionsTable.leagueId, leagueId))
        .orderBy(desc(ruleSuggestionsTable.createdAt));

      return rows.map(row => ({
        id: row.id,
        leagueId: row.leagueId,
        // ... map all fields
        createdAt: row.createdAt,
      }));
    } catch (error: any) {
      // Handle PostgreSQL error codes
      const errorCode = error.code;
      if (errorCode === "42P01") {
        throw new Error("Table does not exist. Please run 'npm run db:push'.");
      }
      if (errorCode === "08003" || errorCode === "08006") {
        throw new Error("Database connection error. Check DATABASE_URL.");
      }
      throw error;
    }
  }

  // CREATE operation example
  async createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion> {
    try {
      const id = randomUUID();
      const createdAt = Date.now();

      await db.insert(ruleSuggestionsTable).values({
        id,
        ...data,
        status: "pending",
        createdAt,
      });

      return {
        id,
        ...data,
        status: "pending",
        createdAt,
      };
    } catch (error: any) {
      // Error handling with PostgreSQL codes
      // ...
    }
  }

  // UPDATE operation example
  async updateRuleSuggestion(id: string, data: { title?: string; description?: string }): Promise<RuleSuggestion | undefined> {
    const [updated] = await db
      .update(ruleSuggestionsTable)
      .set(data)
      .where(eq(ruleSuggestionsTable.id, id))
      .returning();

    return updated ? { ...updated } : undefined;
  }

  // DELETE operation example
  async deleteRuleSuggestion(id: string): Promise<void> {
    await db
      .delete(ruleSuggestionsTable)
      .where(eq(ruleSuggestionsTable.id, id));
  }
}

// Export singleton instance
export const storage = new DatabaseStorage();
```

**Key Points**:
- **Import `db` from `./db`**: Never create new database connections
- **Import tables from `@shared/schema`**: Use centralized table definitions
- **Use Drizzle query builders**: `eq`, `and`, `desc`, `sql`, etc.
- **Error handling**: Check PostgreSQL error codes (42P01 = table missing, 08003/08006 = connection error)
- **Singleton pattern**: Export single `storage` instance
- **Type safety**: Use types from `@shared/schema`

### 5. Usage in Routes

**File**: `server/routes.ts`

Routes import and use the storage layer (never import `db` directly):

```typescript
import { storage } from "./storage";  // Import storage, not db

export async function registerRoutes(httpServer: Server, app: Express) {
  // GET endpoint example
  app.get("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const suggestions = await storage.getRuleSuggestions(leagueId);
      res.json(suggestions);
    } catch (error: any) {
      console.error("[API] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST endpoint example
  app.post("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const { authorId, authorName, rosterId, title, description } = req.body;
      const suggestion = await storage.createRuleSuggestion({
        leagueId: req.params.leagueId,
        authorId,
        authorName,
        rosterId,
        title,
        description,
      });
      res.json(suggestion);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
```

**Key Points**:
- **Import `storage`**: Never import `db` directly in routes
- **Use storage methods**: All database operations go through storage layer
- **Error handling**: Catch and return user-friendly error messages
- **Type safety**: Use types from `@shared/schema` for request/response validation

### 6. Environment Requirements

**Replit Setup**:
1. **Provision Database**: Create a PostgreSQL database in Replit (automatically sets `DATABASE_URL`)
2. **Environment Variable**: `DATABASE_URL` is automatically set by Replit when database is provisioned
3. **No manual configuration needed**: Replit handles connection string automatically

**Migration Process**:
1. **Define tables** in `shared/schema.ts`
2. **Run migration**: `npm run db:push` to sync schema to database
3. **Never manually create tables**: Always use `db:push` command

**Verification**:
- Check `DATABASE_URL` is set: `process.env.DATABASE_URL`
- Run `npm run db:push` after schema changes
- Use Database Viewer (`/admin/database`) to verify tables exist

### 7. Error Handling Pattern

**PostgreSQL Error Codes**:
- **42P01**: Table does not exist → "Run 'npm run db:push' to create tables"
- **08003/08006**: Connection error → "Check DATABASE_URL environment variable"
- **23505**: Unique violation → "Duplicate entry detected"
- **23502**: Not null violation → "Missing required field"

**Example Error Handling**:
```typescript
try {
  await db.insert(table).values(data);
} catch (error: any) {
  const errorCode = error.code;
  const errorMessage = error.message || "";
  
  if (errorCode === "42P01" || errorMessage.includes("does not exist")) {
    throw new Error("Table does not exist. Please run 'npm run db:push'.");
  }
  if (errorCode === "08003" || errorCode === "08006") {
    throw new Error("Database connection error. Check DATABASE_URL.");
  }
  throw new Error(`Database error: ${errorMessage}`);
}
```

### 8. Best Practices

**DO**:
- ✅ Always use the exported `db` instance from `server/db.ts`
- ✅ Always use storage methods (never query `db` directly from routes)
- ✅ Always define tables in `shared/schema.ts` (never inline)
- ✅ Always use Drizzle query builders (`eq`, `and`, `desc`, etc.)
- ✅ Always handle PostgreSQL error codes with actionable messages
- ✅ Always run `npm run db:push` after schema changes
- ✅ Always import tables from `@shared/schema`

**DON'T**:
- ❌ Never create new database connections
- ❌ Never import `db` directly in routes (use `storage` instead)
- ❌ Never define tables inline (always use `shared/schema.ts`)
- ❌ Never use raw SQL when Drizzle query builders are available
- ❌ Never manually create tables in the database
- ❌ Never skip error handling for database operations

## Database Schema Patterns

### Table Definition
```typescript
export const tableName = pgTable("table_name", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
```

#### Field Types
- **Primary keys**: `varchar("id", { length: 36 })` with UUID
- **Foreign keys**: Match referenced table types
- **Timestamps**: `bigint("created_at", { mode: "number" })` storing `Date.now()`
- **Status fields**: `varchar("status", { length: 16 })` with enum values
- **Text fields**: `text("description")` for long text, `varchar("name", { length: 128 })` for short text
- **Numbers**: `integer("count")` for whole numbers

### Schema Organization
1. Table definitions with `pgTable`
2. Zod schemas for API validation
3. Insert schemas using `createInsertSchema().omit(...)`
4. Type exports: `typeof table.$inferSelect` and `z.infer<typeof insertSchema>`

Example:
```typescript
// 1. Table definition
export const ruleSuggestionsTable = pgTable("rule_suggestions", {...});

// 2. Zod schema
export const ruleSuggestionSchema = z.object({...});

// 3. Insert schema
export const insertRuleSuggestionDbSchema = createInsertSchema(ruleSuggestionsTable)
  .omit({ id: true, createdAt: true });

// 4. Type exports
export type RuleSuggestion = z.infer<typeof ruleSuggestionSchema>;
export type InsertRuleSuggestion = z.infer<typeof insertRuleSuggestionDbSchema>;
```

## Common Patterns

### Commissioner Checks
```typescript
const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const isCommissioner = !!(user?.userId && league && (
  (league.commissionerId && user.userId === league.commissionerId) ||
  COMMISSIONER_USER_IDS.includes(user.userId)
));
```

### Team Selection Requirement
```typescript
// In component
const { data: standings } = useQuery({
  queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
  enabled: !!league?.leagueId && !!user?.userId,
});

const userRosterId = standings?.find((s: any) => s.isUser)?.rosterId;
const hasSelectedTeam = !!userRosterId;

// Show SetupModal if no team
if (!hasSelectedTeam) {
  return <SetupModal open={true} onComplete={...} />;
}

// Disable actions
<Button disabled={!hasSelectedTeam} onClick={handleAction}>
  Action
</Button>
```

### Time Formatting
```typescript
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

### Query Key Patterns
- Match URL structure: `["/api/league", leagueId, "resource"]`
- Include all parameters that affect the query
- Use consistent key structure across related queries
- Group by resource type: `["/api/league", leagueId, "resource", id]`

### Helper Functions
```typescript
// Team initials
function getTeamInitials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// Grade calculation
function calculateGrade(percentAboveMedian: number): string {
  if (percentAboveMedian >= 100) return "A+";
  if (percentAboveMedian >= 75) return "A";
  // ... etc
}
```

## File Naming Conventions

- **Components**: PascalCase (e.g., `PlayerTable.tsx`, `AppSidebar.tsx`)
- **Pages**: PascalCase (e.g., `Dashboard.tsx`, `RuleChanges.tsx`)
- **Utilities**: camelCase (e.g., `queryClient.ts`, `utils.ts`)
- **Types**: PascalCase interfaces/types (e.g., `RuleSuggestion`, `UserInfo`)
- **Constants**: UPPER_SNAKE_CASE for constants (e.g., `COMMISSIONER_USER_IDS`), camelCase for config objects

## Import Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- Always use absolute imports, not relative paths

Example:
```typescript
// Good
import { useSleeper } from "@/lib/sleeper-context";
import type { RuleSuggestion } from "@shared/schema";

// Bad
import { useSleeper } from "../../lib/sleeper-context";
```

## State Management

- **Global State**: React Context (`SleeperProvider` for user/league data)
- **Server State**: TanStack Query (all API data)
- **Local State**: `useState` for component-specific state
- **Form State**: Controlled components or `react-hook-form` for complex forms

## Testing Patterns

- Use `data-testid` attributes for testing
- Format: `data-testid="element-purpose"` (e.g., `data-testid="button-submit"`)
- Use descriptive test IDs that indicate the element's purpose

Example:
```typescript
<Button data-testid="button-submit-rule">Submit</Button>
<Input data-testid="input-rule-title" />
```

## Code Organization Best Practices

### Component Organization
1. Imports (grouped as specified)
2. Constants and helper functions
3. Interfaces/types
4. Main component function
5. Sub-components (if any)

### Function Organization
1. Hooks (useState, useQuery, etc.)
2. Computed values (useMemo if needed)
3. Event handlers
4. Effects (useEffect)
5. Early returns
6. Main render

### API Route Organization
1. Route definition
2. Try-catch wrapper
3. Parameter extraction and validation
4. Business logic
5. Database operations
6. Response formatting
7. Error handling

## Performance Considerations

- Use `useMemo` for expensive computations
- Use `useCallback` for functions passed as props
- Set appropriate `staleTime` for queries that don't change often
- Use `enabled` condition to prevent unnecessary queries
- Implement pagination for large data sets
- Use skeleton loaders instead of spinners for better UX

## Security Considerations

- Always validate user input on the backend
- Check permissions (commissioner checks) before sensitive operations
- Use parameterized queries (Drizzle handles this)
- Never expose sensitive data in error messages
- Validate team ownership before allowing actions

## Documentation

- Add JSDoc comments for complex functions
- Document interfaces and types
- Include examples for reusable components
- Update this document when new patterns emerge

