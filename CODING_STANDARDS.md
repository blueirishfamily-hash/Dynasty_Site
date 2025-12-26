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

### Storage Layer Pattern (Based on Award Implementation)

**Key Principles:**
- Keep storage methods simple and focused
- Let API routes handle error handling and validation
- Use Drizzle query builders for all queries
- Map database rows directly to return types
- Use `and()` with multiple `eq()` conditions for filtering

#### GET Method Pattern
```typescript
async getResource(leagueId: string, filter1: string, filter2: string): Promise<Resource[]> {
  const rows = await db
    .select()
    .from(resourceTable)
    .where(and(
      eq(resourceTable.leagueId, leagueId),
      eq(resourceTable.filter1, filter1),
      eq(resourceTable.filter2, filter2)
    ))
    .orderBy(desc(resourceTable.createdAt));

  return rows.map(row => ({
    id: row.id,
    leagueId: row.leagueId,
    filter1: row.filter1,
    filter2: row.filter2,
    createdAt: row.createdAt,
  }));
}
```

#### CREATE Method Pattern
```typescript
async createResource(data: InsertResource): Promise<Resource> {
  // Check for existing record if needed (prevents duplicates)
  const [existing] = await db
    .select()
    .from(resourceTable)
    .where(and(
      eq(resourceTable.leagueId, data.leagueId),
      eq(resourceTable.uniqueField, data.uniqueField)
    ));

  if (existing) {
    // Return existing record
    return {
      id: existing.id,
      ...existing,
    };
  }

  // Generate ID and timestamp
  const id = randomUUID();
  const createdAt = Date.now();

  // Insert new record
  await db.insert(resourceTable).values({
    id,
    ...data,
    createdAt,
  });

  // Return formatted result
  return {
    id,
    ...data,
    createdAt,
  };
}
```

#### UPSERT Method Pattern
```typescript
async upsertResource(data: InsertResource): Promise<Resource> {
  // Check for existing record
  const existing = await this.getResourceByUniqueKey(data.leagueId, data.uniqueKey);

  if (existing) {
    // Update existing record
    const [updated] = await db
      .update(resourceTable)
      .set({
        field1: data.field1,
        field2: data.field2,
      })
      .where(eq(resourceTable.id, existing.id))
      .returning();

    return {
      id: updated.id,
      ...updated,
    };
  }

  // Insert new record
  const id = randomUUID();
  const createdAt = Date.now();

  await db.insert(resourceTable).values({
    id,
    ...data,
    createdAt,
  });

  return {
    id,
    ...data,
    createdAt,
  };
}
```

#### GET by Unique Key Pattern
```typescript
async getResourceByUniqueKey(leagueId: string, uniqueKey: string): Promise<Resource | undefined> {
  const [row] = await db
    .select()
    .from(resourceTable)
    .where(and(
      eq(resourceTable.leagueId, leagueId),
      eq(resourceTable.uniqueKey, uniqueKey)
    ));

  if (!row) return undefined;

  return {
    id: row.id,
    ...row,
  };
}
```

**Storage Method Best Practices:**
- ✅ Keep methods simple - no extensive error handling
- ✅ Use Drizzle query builders (`eq`, `and`, `desc`, `sql`)
- ✅ Map rows directly to return types
- ✅ Use `and()` for multiple filter conditions
- ✅ Return `undefined` for not found (not `null`)
- ✅ Let API routes handle validation and error messages
- ❌ Don't add try-catch in storage methods (handle at route level)
- ❌ Don't add extensive logging (keep it minimal)
- ❌ Don't validate input (validate at route level)

## Database Connection Pattern (Replit/Neon PostgreSQL)

### Overview

This project uses **Neon Serverless PostgreSQL** with **Drizzle ORM** for database connections. The connection pattern is designed specifically for Replit's serverless environment and must be followed for all database operations.

**⚠️ IMPORTANT: This pattern is based on the League Awards implementation** (`award_nominations` and `award_ballots` tables). All new database connections should follow this exact pattern:
- **Storage methods**: Simple, focused, no extensive error handling
- **API routes**: Handle validation and errors at route level
- **Frontend**: Use TanStack Query with proper query keys and enable conditions
- **Query builders**: Use `and()` with multiple `eq()` conditions for filtering

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

All database operations are abstracted through a storage layer. **Follow the award implementation pattern** - keep storage methods simple and let API routes handle error handling.

```typescript
import { randomUUID } from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";  // Import from single source
import {
  awardNominationsTable,  // Import tables from schema
  awardBallotsTable,
  // ... other tables
} from "@shared/schema";
import type { 
  AwardNomination, 
  InsertAwardNomination,
  AwardBallot,
  InsertAwardBallot,
  // ... other types
} from "@shared/schema";

export class DatabaseStorage implements IStorage {
  // GET operation example (based on award nominations)
  async getAwardNominations(
    leagueId: string, 
    season: string, 
    awardType: "mvp" | "roy" | "gm"
  ): Promise<AwardNomination[]> {
    const rows = await db
      .select()
      .from(awardNominationsTable)
      .where(and(
        eq(awardNominationsTable.leagueId, leagueId),
        eq(awardNominationsTable.season, season),
        eq(awardNominationsTable.awardType, awardType)
      ))
      .orderBy(desc(awardNominationsTable.createdAt));

    return rows.map(row => ({
      id: row.id,
      leagueId: row.leagueId,
      season: row.season,
      awardType: row.awardType as "mvp" | "roy" | "gm",
      playerId: row.playerId,
      playerName: row.playerName,
      playerPosition: row.playerPosition,
      playerTeam: row.playerTeam,
      nominatedBy: row.nominatedBy,
      nominatedByName: row.nominatedByName,
      nominatedByRosterId: row.nominatedByRosterId,
      createdAt: row.createdAt,
    }));
  }

  // CREATE operation example (with duplicate check)
  async createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination> {
    // Check for existing record to prevent duplicates
    const [existing] = await db
      .select()
      .from(awardNominationsTable)
      .where(and(
        eq(awardNominationsTable.leagueId, data.leagueId),
        eq(awardNominationsTable.season, data.season),
        eq(awardNominationsTable.awardType, data.awardType),
        eq(awardNominationsTable.playerId, data.playerId)
      ));

    if (existing) {
      // Return existing record
      return {
        id: existing.id,
        leagueId: existing.leagueId,
        season: existing.season,
        awardType: existing.awardType as "mvp" | "roy" | "gm",
        playerId: existing.playerId,
        playerName: existing.playerName,
        playerPosition: existing.playerPosition,
        playerTeam: existing.playerTeam,
        nominatedBy: existing.nominatedBy,
        nominatedByName: existing.nominatedByName,
        nominatedByRosterId: existing.nominatedByRosterId,
        createdAt: existing.createdAt,
      };
    }

    // Generate ID and timestamp
    const id = randomUUID();
    const createdAt = Date.now();

    // Insert new record
    await db.insert(awardNominationsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      awardType: data.awardType,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      playerTeam: data.playerTeam,
      nominatedBy: data.nominatedBy,
      nominatedByName: data.nominatedByName,
      nominatedByRosterId: data.nominatedByRosterId,
      createdAt,
    });

    return {
      id,
      ...data,
      createdAt,
    };
  }

  // UPSERT operation example (based on award ballots)
  async upsertAwardBallot(data: InsertAwardBallot): Promise<AwardBallot> {
    // Check for existing record
    const existing = await this.getAwardBallotByRoster(
      data.leagueId, 
      data.season, 
      data.awardType, 
      data.rosterId
    );

    if (existing) {
      // Update existing record
      const [updated] = await db
        .update(awardBallotsTable)
        .set({
          firstPlaceId: data.firstPlaceId,
          secondPlaceId: data.secondPlaceId,
          thirdPlaceId: data.thirdPlaceId,
          voterName: data.voterName,
        })
        .where(eq(awardBallotsTable.id, existing.id))
        .returning();

      return {
        id: updated.id,
        leagueId: updated.leagueId,
        season: updated.season,
        awardType: updated.awardType as "mvp" | "roy" | "gm",
        rosterId: updated.rosterId,
        voterName: updated.voterName,
        firstPlaceId: updated.firstPlaceId,
        secondPlaceId: updated.secondPlaceId,
        thirdPlaceId: updated.thirdPlaceId,
        createdAt: updated.createdAt,
      };
    }

    // Insert new record
    const id = randomUUID();
    const createdAt = Date.now();

    await db.insert(awardBallotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      awardType: data.awardType,
      rosterId: data.rosterId,
      voterName: data.voterName,
      firstPlaceId: data.firstPlaceId,
      secondPlaceId: data.secondPlaceId,
      thirdPlaceId: data.thirdPlaceId,
      createdAt,
    });

    return {
      id,
      ...data,
      createdAt,
    };
  }

  // GET by unique key example
  async getAwardBallotByRoster(
    leagueId: string, 
    season: string, 
    awardType: "mvp" | "roy" | "gm", 
    rosterId: number
  ): Promise<AwardBallot | undefined> {
    const [row] = await db
      .select()
      .from(awardBallotsTable)
      .where(and(
        eq(awardBallotsTable.leagueId, leagueId),
        eq(awardBallotsTable.season, season),
        eq(awardBallotsTable.awardType, awardType),
        eq(awardBallotsTable.rosterId, rosterId)
      ));

    if (!row) return undefined;

    return {
      id: row.id,
      leagueId: row.leagueId,
      season: row.season,
      awardType: row.awardType as "mvp" | "roy" | "gm",
      rosterId: row.rosterId,
      voterName: row.voterName,
      firstPlaceId: row.firstPlaceId,
      secondPlaceId: row.secondPlaceId,
      thirdPlaceId: row.thirdPlaceId,
      createdAt: row.createdAt,
    };
  }
}

// Export singleton instance
export const storage = new DatabaseStorage();
```

**Key Points** (Based on Award Implementation):
- **Import `db` from `./db`**: Never create new database connections
- **Import tables from `@shared/schema`**: Use centralized table definitions
- **Use Drizzle query builders**: `eq`, `and`, `desc` for filtering and ordering
- **Keep methods simple**: No extensive error handling in storage methods
- **Use `and()` for multiple filters**: Combine multiple `eq()` conditions
- **Map rows directly**: Return types match database row structure
- **Return `undefined` for not found**: Not `null`
- **Let routes handle errors**: API routes handle try-catch and error messages
- **Singleton pattern**: Export single `storage` instance
- **Type safety**: Use types from `@shared/schema`

### 5. Usage in Routes

**File**: `server/routes.ts`

Routes import and use the storage layer (never import `db` directly). **Follow the award implementation pattern** - handle validation and errors at the route level.

```typescript
import { storage } from "./storage";  // Import storage, not db

export async function registerRoutes(httpServer: Server, app: Express) {
  // GET endpoint example (based on award nominations)
  app.get("/api/league/:leagueId/awards/:season/:awardType", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      
      // Validate award type
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      
      // Fetch via storage
      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      res.json(nominations);
    } catch (error) {
      console.error("Error fetching award nominations:", error);
      res.status(500).json({ error: "Failed to fetch award nominations" });
    }
  });

  // POST endpoint example (with validation)
  app.post("/api/league/:leagueId/awards/:season/:awardType/nominate", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { playerId, playerName, playerPosition, playerTeam, nominatedBy, nominatedByName, nominatedByRosterId } = req.body;
      
      // Validate award type
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      
      // Validate required fields
      if (!playerId || !playerName || !nominatedBy || !nominatedByName || !nominatedByRosterId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Business logic validation (e.g., check limits)
      const currentCount = await storage.getNominationCountByRoster(leagueId, season, awardType, nominatedByRosterId);
      if (currentCount >= 3) {
        return res.status(400).json({ error: "Maximum 3 nominations per team per award" });
      }

      // Create via storage
      const nomination = await storage.createAwardNomination({
        leagueId,
        season,
        awardType,
        playerId,
        playerName,
        playerPosition: playerPosition || "",
        playerTeam: playerTeam || null,
        nominatedBy,
        nominatedByName,
        nominatedByRosterId,
      });
      
      res.json(nomination);
    } catch (error) {
      console.error("Error creating award nomination:", error);
      res.status(500).json({ error: "Failed to create award nomination" });
    }
  });

  // UPSERT endpoint example (based on award ballots)
  app.post("/api/league/:leagueId/awards/:season/:awardType/ballot", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { rosterId, voterName, firstPlaceId, secondPlaceId, thirdPlaceId } = req.body;
      
      // Validate award type
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      
      // Validate required fields
      if (!rosterId || !voterName || !firstPlaceId || !secondPlaceId || !thirdPlaceId) {
        return res.status(400).json({ error: "Missing required fields - must vote for 1st, 2nd, and 3rd place" });
      }

      // Business logic validation
      if (firstPlaceId === secondPlaceId || firstPlaceId === thirdPlaceId || secondPlaceId === thirdPlaceId) {
        return res.status(400).json({ error: "Cannot vote for the same player multiple times" });
      }

      // Validate picks are valid nominations
      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      const nominationIds = new Set(nominations.map(n => n.id));
      if (!nominationIds.has(firstPlaceId) || !nominationIds.has(secondPlaceId) || !nominationIds.has(thirdPlaceId)) {
        return res.status(400).json({ error: "Invalid nomination ID" });
      }

      // Upsert via storage
      const ballot = await storage.upsertAwardBallot({
        leagueId,
        season,
        awardType,
        rosterId,
        voterName,
        firstPlaceId,
        secondPlaceId,
        thirdPlaceId,
      });
      
      res.json(ballot);
    } catch (error) {
      console.error("Error submitting ballot:", error);
      res.status(500).json({ error: "Failed to submit ballot" });
    }
  });
}
```

**Key Points** (Based on Award Implementation):
- **Import `storage`**: Never import `db` directly in routes
- **Use storage methods**: All database operations go through storage layer
- **Validate at route level**: Check parameters, required fields, and business logic
- **Handle errors at route level**: Try-catch in routes, not storage methods
- **Return appropriate status codes**: 400 for validation errors, 500 for server errors
- **Type safety**: Use types from `@shared/schema` for request/response validation

### 6. Frontend Data Fetching Pattern

**File**: `client/src/pages/YourPage.tsx`

Frontend uses TanStack Query to fetch data from API routes. **Follow the award implementation pattern** - use proper query keys and enable conditions.

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { queryClient } from "@/lib/queryClient";
import type { AwardNomination, AwardBallot } from "@shared/schema";

export default function YourPage() {
  const { user, league, season } = useSleeper();
  const { toast } = useToast();

  // GET query example (based on award nominations)
  const { data: nominations, isLoading } = useQuery<AwardNomination[]>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, awardType],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/${awardType}`);
      if (!res.ok) throw new Error("Failed to fetch award nominations");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season,  // Only fetch when required params exist
  });

  // GET by unique key example (based on user ballot)
  const { data: userBallot } = useQuery<AwardBallot | null>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "ballot", userRosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/${awardType}/ballot/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch ballot");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season && !!userRosterId,
  });

  // POST mutation example
  const createNominationMutation = useMutation({
    mutationFn: async (data: { playerId: string; playerName: string; /* ... */ }) => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/${awardType}/nominate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create nomination");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: ["/api/league", league?.leagueId, "awards", season, awardType] 
      });
      toast({ 
        title: "Nomination submitted!", 
        description: "Your nomination has been recorded." 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // UPSERT mutation example
  const submitBallotMutation = useMutation({
    mutationFn: async (data: { firstPlaceId: string; secondPlaceId: string; thirdPlaceId: string }) => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/${awardType}/ballot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to submit ballot");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate user ballot query
      queryClient.invalidateQueries({ 
        queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "ballot", userRosterId] 
      });
      toast({ 
        title: "Ballot submitted!", 
        description: "Your vote has been recorded." 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Render with loading states
  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div>
      {nominations?.map(nomination => (
        <Card key={nomination.id}>
          {/* Render nomination */}
        </Card>
      ))}
    </div>
  );
}
```

**Key Points** (Based on Award Implementation):
- **Use TanStack Query**: All data fetching through `useQuery` and `useMutation`
- **Query keys match URL structure**: `["/api/league", leagueId, "resource", ...params]`
- **Use `enabled` condition**: Only fetch when required parameters exist
- **Handle errors in mutations**: Use `onError` callback with toast notifications
- **Invalidate queries on success**: Update related queries after mutations
- **Import types from `@shared/schema`**: Type safety for API responses
- **Loading states**: Use `isLoading` to show skeletons or spinners

### 7. Environment Requirements

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

## Sleeper API Connection Pattern

### Overview

This project integrates with the Sleeper Fantasy Football API to fetch league data, rosters, drafts, and player information. All Sleeper API connections follow a consistent pattern to ensure maintainability, type safety, and proper error handling.

**⚠️ IMPORTANT: All Sleeper API connections must follow this pattern** - use the centralized `fetchFromSleeper` function, define TypeScript interfaces, expose via Express routes, and consume via TanStack Query on the frontend.

### 1. Base Setup

**File**: `server/sleeper.ts`

The Sleeper API integration is centralized in a single file that provides:
- Base URL constant
- Core fetch function with error handling
- TypeScript interfaces for all API responses
- Caching strategy for frequently accessed data

```typescript
// Base URL constant
const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

// Core fetch function - handles all API calls
async function fetchFromSleeper<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${SLEEPER_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
```

**Key Points**:
- **Single base URL**: All endpoints use `https://api.sleeper.app/v1`
- **Generic fetch function**: `fetchFromSleeper<T>` provides type safety
- **Error handling**: Throws errors with status codes for route-level handling
- **No authentication required**: Sleeper API is public (no API keys needed)

### 2. Function Creation Pattern

**File**: `server/sleeper.ts`

All Sleeper API functions follow a consistent pattern:

```typescript
// 1. Define TypeScript interface for response
export interface SleeperResource {
  resource_id: string;
  name: string;
  // ... other fields
}

// 2. Create async function with typed return
export async function getResource(params: string): Promise<SleeperResource> {
  return fetchFromSleeper<SleeperResource>(`/endpoint/${params}`);
}

// 3. For arrays, use array type
export async function getResources(leagueId: string): Promise<SleeperResource[]> {
  return fetchFromSleeper<SleeperResource[]>(`/league/${leagueId}/resources`);
}

// 4. For optional/nullable responses, handle in function
export async function getOptionalResource(username: string): Promise<SleeperResource | null> {
  try {
    return await fetchFromSleeper<SleeperResource>(`/user/${username}`);
  } catch {
    return null; // Return null on error instead of throwing
  }
}
```

**Function Naming Conventions**:
- **GET operations**: `get{Resource}` (e.g., `getLeague`, `getDraftPicks`)
- **Collections**: Plural form (e.g., `getLeagueDrafts`, `getLeagueRosters`)
- **Specific resources**: Include identifier (e.g., `getDraft(draftId)`, `getSleeperUser(username)`)

**Caching Pattern** (for frequently accessed data):
```typescript
let resourceCache: Record<string, SleeperResource> | null = null;
let resourceCacheTime: number = 0;
const RESOURCE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedResource(): Promise<Record<string, SleeperResource>> {
  const now = Date.now();
  if (resourceCache && now - resourceCacheTime < RESOURCE_CACHE_DURATION) {
    return resourceCache;
  }
  
  resourceCache = await fetchFromSleeper<Record<string, SleeperResource>>(`/resource`);
  resourceCacheTime = now;
  return resourceCache;
}
```

**Key Points**:
- **Type safety**: Always define TypeScript interfaces for API responses
- **Consistent naming**: Use `get{Resource}` pattern
- **Error handling**: Let errors bubble up to route level (except for optional resources)
- **Caching**: Use module-level variables for frequently accessed, rarely-changing data (e.g., player data)

### 3. Route Integration Pattern

**File**: `server/routes.ts`

Sleeper API functions are exposed via Express routes with consistent error handling:

```typescript
import {
  getLeague,
  getLeagueDrafts,
  getDraftPicks,
  type SleeperDraft,
  type SleeperDraftPick,
} from "./sleeper";

// Simple GET endpoint pattern
app.get("/api/sleeper/league/:leagueId", async (req, res) => {
  try {
    const league = await getLeague(req.params.leagueId);
    // Transform Sleeper API response to frontend format
    res.json({
      leagueId: league.league_id,
      name: league.name,
      season: league.season,
      // ... map other fields
    });
  } catch (error) {
    console.error("Error fetching league:", error);
    res.status(500).json({ error: "Failed to fetch league" });
  }
});

// GET endpoint with data transformation
app.get("/api/sleeper/league/:leagueId/drafts", async (req, res) => {
  try {
    const drafts = await getLeagueDrafts(req.params.leagueId);
    // Transform array of Sleeper API responses
    res.json(drafts.map(draft => ({
      draftId: draft.draft_id,
      leagueId: draft.league_id,
      season: draft.season,
      status: draft.status,
      type: draft.type,
      // ... map other fields
    })));
  } catch (error) {
    console.error("Error fetching league drafts:", error);
    res.status(500).json({ error: "Failed to fetch league drafts" });
  }
});

// GET endpoint with multiple API calls
app.get("/api/sleeper/draft/:draftId/picks", async (req, res) => {
  try {
    const [draft, picks] = await Promise.all([
      getDraft(req.params.draftId),
      getDraftPicks(req.params.draftId),
    ]);

    // Fetch additional data if needed
    const [users, rosters] = await Promise.all([
      getLeagueUsers(draft.league_id),
      getLeagueRosters(draft.league_id),
    ]);

    // Transform and combine data
    res.json(picks.map(pick => ({
      round: pick.round,
      playerId: pick.player_id,
      // ... map other fields with additional context
    })));
  } catch (error) {
    console.error("Error fetching draft picks:", error);
    res.status(500).json({ error: "Failed to fetch draft picks" });
  }
});

// GET endpoint with query parameters
app.get("/api/sleeper/user/:userId/leagues", async (req, res) => {
  try {
    const season = req.query.season as string || new Date().getFullYear().toString();
    const leagues = await getUserLeagues(req.params.userId, season);
    res.json(leagues.map(league => ({ /* transform */ })));
  } catch (error) {
    console.error("Error fetching leagues:", error);
    res.status(500).json({ error: "Failed to fetch leagues" });
  }
});

// GET endpoint with 404 handling
app.get("/api/sleeper/user/:username", async (req, res) => {
  try {
    const user = await getSleeperUser(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      userId: user.user_id,
      username: user.username,
      // ... transform
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});
```

**Route Naming Conventions**:
- **Base path**: `/api/sleeper/`
- **Resources**: `/api/sleeper/{resource}/:id` (e.g., `/api/sleeper/league/:leagueId`)
- **Nested resources**: `/api/sleeper/{resource}/:id/{subresource}` (e.g., `/api/sleeper/league/:leagueId/drafts`)
- **Actions**: Use descriptive paths (e.g., `/api/sleeper/league/:leagueId/standings`)

**Key Points**:
- **Always wrap in try-catch**: Handle errors at route level
- **Transform responses**: Convert Sleeper API snake_case to frontend camelCase
- **Use Promise.all**: For parallel API calls
- **Status codes**: 404 for not found, 500 for server errors
- **Error logging**: Use `console.error` with descriptive messages
- **Response format**: Always return JSON with `{ error: "message" }` for errors

### 4. Frontend Integration Pattern

**File**: `client/src/pages/YourPage.tsx`

Frontend uses TanStack Query to fetch data from Sleeper API routes:

```typescript
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";

export default function YourPage() {
  const { user, league, season } = useSleeper();

  // Basic query pattern
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "resource"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/resource`);
      if (!res.ok) throw new Error("Failed to fetch resource");
      return res.json();
    },
    enabled: !!league?.leagueId, // Only fetch when league is available
  });

  // Query with query parameters
  const { data: standings } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  // Query with staleTime for infrequently changing data
  const { data: predictions } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Loading state
  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  // Error state
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error?.message || "Failed to load data"}</AlertDescription>
      </Alert>
    );
  }

  // Render data
  return (
    <div>
      {data?.map(item => (
        <Card key={item.id}>
          {/* Render item */}
        </Card>
      ))}
    </div>
  );
}
```

**Query Key Pattern**:
- **Match URL structure**: `["/api/sleeper/league", leagueId, "resource"]`
- **Include all parameters**: Add query params to key (e.g., `userId`, `season`)
- **Consistent structure**: Use same key pattern across related queries

**Key Points**:
- **Use `enabled` condition**: Prevent queries when required data is missing
- **Error handling**: Check `isError` and display user-friendly messages
- **Loading states**: Show skeletons or spinners during loading
- **Query keys**: Match URL structure for easy invalidation
- **StaleTime**: Set for data that doesn't change frequently (e.g., historical data)

### 5. Common Sleeper API Endpoints

**League Endpoints**:
- `GET /league/{league_id}` - Get league details
- `GET /league/{league_id}/rosters` - Get all rosters
- `GET /league/{league_id}/users` - Get league users
- `GET /league/{league_id}/matchups/{week}` - Get week matchups
- `GET /league/{league_id}/transactions/{week}` - Get week transactions
- `GET /league/{league_id}/drafts` - Get all drafts
- `GET /league/{league_id}/traded_picks` - Get traded draft picks
- `GET /league/{league_id}/winners_bracket` - Get playoff bracket

**Draft Endpoints**:
- `GET /draft/{draft_id}` - Get draft details
- `GET /draft/{draft_id}/picks` - Get all draft picks

**User Endpoints**:
- `GET /user/{username}` - Get user by username
- `GET /user/{user_id}/leagues/nfl/{season}` - Get user's leagues

**Player Endpoints**:
- `GET /players/nfl` - Get all NFL players (cached)
- `GET /stats/nfl/regular/{season}/{week}` - Get player stats
- `GET /projections/nfl/regular/{season}/{week}` - Get player projections

**State Endpoints**:
- `GET /state/nfl` - Get NFL state (current week, season)

**Status Value Variations**:
Sleeper API may return different status values for the same state. Always handle multiple variations:
```typescript
// Draft status variations
const isDraftComplete = (status: string) => {
  return status === "complete" || 
         status === "completed" || 
         status === "finished" ||
         status === "closed";
};

// Use helper function when filtering
const completedDrafts = drafts.filter(d => isDraftComplete(d.status));
```

### 6. Error Handling Best Practices

**Sleeper API Errors**:
- **404 Not Found**: Resource doesn't exist (e.g., invalid league ID)
- **500 Server Error**: Sleeper API is down or experiencing issues
- **Network Errors**: Connection timeout or network failure

**Error Handling in Functions** (`server/sleeper.ts`):
```typescript
// For required resources - let error bubble up
export async function getLeague(leagueId: string): Promise<SleeperLeague> {
  return fetchFromSleeper<SleeperLeague>(`/league/${leagueId}`);
  // Errors will be thrown and caught by route
}

// For optional resources - return null on error
export async function getSleeperUser(username: string): Promise<SleeperUser | null> {
  try {
    return await fetchFromSleeper<SleeperUser>(`/user/${username}`);
  } catch {
    return null; // Return null instead of throwing
  }
}
```

**Error Handling in Routes** (`server/routes.ts`):
```typescript
app.get("/api/sleeper/league/:leagueId", async (req, res) => {
  try {
    const league = await getLeague(req.params.leagueId);
    res.json(/* transform */);
  } catch (error: any) {
    console.error("Error fetching league:", error);
    
    // Check for specific error types
    if (error.message?.includes("404") || error.message?.includes("Not Found")) {
      return res.status(404).json({ error: "League not found" });
    }
    
    // Generic error response
    res.status(500).json({ error: "Failed to fetch league" });
  }
});
```

**Error Handling in Frontend**:
```typescript
const { data, isError, error } = useQuery({
  queryKey: ["/api/sleeper/league", leagueId, "resource"],
  queryFn: async () => {
    const res = await fetch(`/api/sleeper/league/${leagueId}/resource`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch: ${res.status}`);
    }
    return res.json();
  },
  retry: 2, // Retry failed requests up to 2 times
  retryDelay: 1000, // Wait 1 second between retries
});

// Display error in UI
if (isError) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        {error?.message || "Failed to load data. Please try again later."}
      </AlertDescription>
    </Alert>
  );
}
```

**Key Points**:
- **Route-level handling**: Always wrap Sleeper API calls in try-catch
- **User-friendly messages**: Don't expose internal error details
- **Status codes**: Use appropriate HTTP status codes (404, 500)
- **Retry logic**: Consider retry for transient network errors
- **Logging**: Log errors with `console.error` for debugging

### 7. Type Definitions

**File**: `server/sleeper.ts`

All Sleeper API response types are defined in `server/sleeper.ts`:

```typescript
// Use snake_case to match Sleeper API response
export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  owner_id: string;
  settings: {
    playoff_teams?: number;
    waiver_budget?: number;
    [key: string]: unknown; // For additional fields
  };
}

// Use descriptive names with "Sleeper" prefix
export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  season: string;
  status: string;
  type: string;
  settings: {
    rounds: number;
    [key: string]: unknown;
  };
}

// Export types for use in routes
export type { SleeperLeague, SleeperDraft, /* ... */ };
```

**Naming Conventions**:
- **Prefix**: All interfaces prefixed with `Sleeper` (e.g., `SleeperLeague`, `SleeperDraftPick`)
- **Snake_case**: Match Sleeper API response format (e.g., `league_id`, `draft_id`)
- **Optional fields**: Use `?` for optional fields (e.g., `avatar: string | null`)
- **Index signatures**: Use `[key: string]: unknown` for dynamic fields in settings objects

**Type Usage in Routes**:
```typescript
import type { SleeperLeague, SleeperDraft } from "./sleeper";

// Use types for function parameters and return values
app.get("/api/sleeper/league/:leagueId", async (req, res) => {
  const league: SleeperLeague = await getLeague(req.params.leagueId);
  // Transform to frontend format
});
```

**Key Points**:
- **Centralized types**: All Sleeper API types in `server/sleeper.ts`
- **Match API format**: Use snake_case to match Sleeper API responses
- **Export types**: Export types for use in routes and other modules
- **Type safety**: Use TypeScript interfaces for all API responses

### 8. Best Practices Summary

**DO**:
- ✅ Always use `fetchFromSleeper<T>` for all Sleeper API calls
- ✅ Define TypeScript interfaces for all API responses
- ✅ Transform snake_case to camelCase in routes
- ✅ Wrap all route handlers in try-catch
- ✅ Use `enabled` condition in frontend queries
- ✅ Handle multiple status value variations
- ✅ Cache frequently accessed, rarely-changing data (e.g., player data)
- ✅ Use `Promise.all` for parallel API calls
- ✅ Return user-friendly error messages

**DON'T**:
- ❌ Never call Sleeper API directly from frontend (always use backend routes)
- ❌ Never expose Sleeper API errors directly to users
- ❌ Never skip error handling in routes
- ❌ Don't assume status values are consistent (handle variations)
- ❌ Don't cache data that changes frequently
- ❌ Don't make unnecessary sequential API calls (use `Promise.all`)

## League Settings Toggle Pattern

This pattern documents how to implement commissioner-controlled feature toggles that affect league-wide behavior (e.g., dead cap feature). Follow this pattern for all future league setting toggles.

### Overview

League settings toggles allow commissioners to enable/disable features for the entire league. Settings are stored in the `league_settings` table and accessed via dedicated API endpoints.

### Implementation Steps

#### 1. Backend API Endpoints (`server/routes.ts`)

**GET Endpoint** (fetch current setting):
```typescript
// Specific route MUST come BEFORE generic /settings/:settingKey route
app.get("/api/league/:leagueId/settings/your-setting-key", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const value = await storage.getLeagueSetting(leagueId, "your_setting_key");
    // Default value for backward compatibility if setting doesn't exist
    res.json({ enabled: value === "true" }); // or { value: value ?? "default" }
  } catch (error) {
    console.error("Error fetching setting:", error);
    res.status(500).json({ error: "Failed to fetch setting" });
  }
});
```

**PUT Endpoint** (update setting - commissioner only):
```typescript
// Specific route MUST come BEFORE generic /settings/:settingKey route
app.put("/api/league/:leagueId/settings/your-setting-key", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.query.userId as string;
    const { enabled } = req.body; // or { value } depending on setting type
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Enabled must be a boolean" });
    }

    // Check if user is commissioner
    const isComm = await isCommissioner(userId, leagueId);
    
    if (!isComm) {
      return res.status(403).json({ error: "Unauthorized: Only commissioners can change this setting" });
    }
    
    const setting = await storage.setLeagueSetting(leagueId, "your_setting_key", enabled ? "true" : "false");
    res.json({ enabled: setting.settingValue === "true" });
  } catch (error) {
    console.error("Error setting setting:", error);
    res.status(500).json({ error: "Failed to set setting" });
  }
});
```

**Important**: Specific routes (e.g., `/settings/dead-cap-enabled`) must be defined BEFORE generic routes (e.g., `/settings/:settingKey`) to ensure proper route matching.

#### 2. Storage Layer (`server/storage.ts`)

The storage layer already provides `getLeagueSetting` and `setLeagueSetting` methods that use the `league_settings` table. No additional storage methods needed.

```typescript
// Already implemented in DatabaseStorage class:
async getLeagueSetting(leagueId: string, settingKey: string): Promise<string | undefined>
async setLeagueSetting(leagueId: string, settingKey: string, settingValue: string): Promise<LeagueSetting>
```

#### 3. Frontend Query (`client/src/pages/YourPage.tsx`)

**Fetch Setting**:
```typescript
const { data: settingData, refetch: refetchSetting } = useQuery<{ enabled: boolean }>({
  queryKey: ["/api/league", league?.leagueId, "settings", "your-setting-key"],
  queryFn: async () => {
    const res = await fetch(`/api/league/${league?.leagueId}/settings/your-setting-key`);
    if (!res.ok) throw new Error("Failed to fetch setting");
    return res.json();
  },
  enabled: !!league?.leagueId,
});

// Extract value with backward compatibility default
const settingEnabled = settingData?.enabled ?? true; // Default to true (or false) for backward compatibility
```

#### 4. Frontend Mutation (`client/src/pages/YourPage.tsx`)

**Update Setting**:
```typescript
const updateSettingMutation = useMutation({
  mutationFn: async (enabled: boolean) => {
    const res = await fetch(`/api/league/${league?.leagueId}/settings/your-setting-key?userId=${user?.userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update setting");
    }
    return res.json();
  },
  onSuccess: (_, enabled) => {
    refetchSetting(); // Refetch to update UI
    toast({
      title: "Setting Updated",
      description: `Feature ${enabled ? "enabled" : "disabled"}.`,
    });
  },
  onError: (error: Error) => {
    toast({
      title: "Update Failed",
      description: error.message,
      variant: "destructive",
    });
  },
});

const handleSettingToggle = (enabled: boolean) => {
  updateSettingMutation.mutate(enabled);
};
```

#### 5. UI Component (Commissioner-Only Toggle)

**In Main Component or Child Component**:
```typescript
interface YourComponentProps {
  // ... other props
  settingEnabled: boolean;
  onSettingToggle: (enabled: boolean) => void;
}

function YourComponent({ settingEnabled, onSettingToggle, isCommissioner = false }: YourComponentProps) {
  return (
    <div>
      {isCommissioner && (
        <div className="flex items-center gap-2">
          <Switch
            checked={settingEnabled}
            onCheckedChange={(checked) => onSettingToggle(checked)}
            data-testid="switch-your-setting"
          />
          <Label className="text-sm font-medium">Your Setting Label</Label>
        </div>
      )}
      {/* Rest of component */}
    </div>
  );
}
```

#### 6. Conditional Logic Based on Setting

**Throughout Component**:
```typescript
// Example: Conditional calculation
const calculatedValue = settingEnabled ? actualValue : 0; // or default value

// Example: Conditional display
{settingEnabled && (
  <div>
    {/* Feature-specific UI */}
  </div>
)}

// Example: Conditional in useMemo
const memoizedValue = useMemo(() => {
  if (!settingEnabled) return defaultValue; // or empty map/array
  // Calculate based on setting
  return calculatedValue;
}, [dependencies, settingEnabled]);
```

#### 7. Props Passing Pattern

**Main Component**:
```typescript
export default function YourPage() {
  // ... fetch setting (step 3)
  // ... mutation (step 4)
  
  return (
    <YourComponent
      // ... other props
      settingEnabled={settingEnabled}
      onSettingToggle={handleSettingToggle}
      isCommissioner={isCommissioner}
    />
  );
}
```

### Key Points

**DO**:
- ✅ Always provide backward compatibility defaults (e.g., `?? true` or `?? false`)
- ✅ Use specific API routes (e.g., `/settings/dead-cap-enabled`) before generic routes
- ✅ Check commissioner status on backend (never trust frontend-only checks)
- ✅ Pass `userId` as query parameter for PUT requests
- ✅ Refetch setting after successful mutation
- ✅ Show toast notifications for success/error
- ✅ Use conditional logic throughout component based on setting
- ✅ Hide feature-specific UI when setting is disabled
- ✅ Set calculated values to 0 or default when setting is disabled

**DON'T**:
- ❌ Never rely on frontend-only commissioner checks
- ❌ Never skip backward compatibility defaults
- ❌ Never forget to refetch after mutation
- ❌ Don't place specific routes after generic routes
- ❌ Don't expose setting logic to non-commissioners in UI

### Example: Dead Cap Toggle

See `client/src/pages/Contracts.tsx` and `server/routes.ts` for the complete dead cap toggle implementation:
- **Setting Key**: `dead_cap_enabled`
- **API Routes**: `/api/league/:leagueId/settings/dead-cap-enabled` (GET, PUT)
- **Default**: `true` (backward compatibility)
- **UI Location**: `ContractInputTab` component (commissioner-only)
- **Conditional Logic**: Dead cap calculations return 0 or empty map when disabled

## Documentation

- Add JSDoc comments for complex functions
- Document interfaces and types
- Include examples for reusable components
- Update this document when new patterns emerge

