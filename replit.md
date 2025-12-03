# Dynasty Command - Fantasy Football League Manager

## Overview

Dynasty Command is a premium Dynasty Fantasy Football League Management Platform that integrates with the Sleeper API to provide advanced analytics, trade management, and draft capital tracking. The application offers a data-dense, modern interface inspired by sports analytics platforms (ESPN Fantasy, Yahoo Fantasy) and productivity tools (Linear, Notion).

The platform targets dedicated fantasy football managers who seek deep statistical analysis, complex trade tools, and comprehensive league history beyond the native Sleeper interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript
- Vite for build tooling and development server
- Wouter for client-side routing
- TanStack Query (React Query) for server state management
- shadcn/ui component library with Radix UI primitives
- Tailwind CSS for styling

**Design System:**
- Custom theme based on shadcn/ui "new-york" style
- Typography: Inter for data/tables, Poppins for headings
- Responsive design: Desktop-first approach
- Dark mode support with theme toggle
- Neutral color palette with teal primary accent (160° 84% 39%)

**Component Architecture:**
- Shared UI components in `client/src/components/ui/`
- Feature components in `client/src/components/`
- Page-level components in `client/src/pages/`
- Context-based state management for Sleeper integration (`SleeperContext`)
- Example components for development reference

**Key Features:**
- Dashboard with activity feed, matchup preview, and standings
- Team roster management with player tables and position depth charts
- Trade center with two-pane asset selection interface
- Draft board for future draft capital visualization (3 rounds, with historical data)
- League Hub for governance (rule suggestions and award voting)
- Real-time data syncing with Sleeper API
- Unified matchup view with positional comparison and dual-sided bar graphs
- Automatic lineup optimization: inactive (Out/IR/PUP/Sus/NFI/COV) and bye week players auto-replaced with eligible bench players
- Personalized boom-bust metrics using 8-week rolling window of actual player performance
- Position depth chart showing points above/below median (e.g., "+15.2 pts")
- Playoff predictor with points standings impact analysis:
  - PF Rank showing each team's points-for standings position
  - Points gaps to adjacent teams (behind/ahead)
  - Impact analysis showing playoff odds changes if moving up/down in points standings
  - Monte Carlo simulation with 10,000 iterations
- Standings with win/loss streak calculation (e.g., "W3", "L2", "—")
- Draft lottery odds calculator (Draft Odds tab):
  - Monte Carlo simulation (10,000 iterations) for lottery pick probabilities
  - Weighted lottery system: worst teams get highest odds for top picks
  - Playoff teams get deterministic picks based on projected seed
  - Probabilities sum to 100% for each lottery team across all picks
- Auto-selection of most recent completed draft in Historical tab (prefers 2024 if available)

### Backend Architecture

**Technology Stack:**
- Express.js server with TypeScript
- HTTP server for API endpoints
- Session-based state management (in-memory storage)
- RESTful API design

**API Structure:**
- Proxy endpoints to Sleeper API (`/api/sleeper/*`)
- Session management endpoints
- Data transformation layer to format Sleeper responses for frontend consumption

**Server Components:**
- Route handlers in `server/routes.ts`
- Sleeper API client in `server/sleeper.ts`
- Session storage abstraction in `server/storage.ts`
- Static file serving with SPA fallback
- Development mode with Vite middleware integration

**Data Flow:**
- Frontend requests data through TanStack Query
- Backend proxies requests to Sleeper API
- Responses are transformed and enriched server-side
- Results cached client-side with React Query

### Data Storage Solutions

**Current Implementation:**
- PostgreSQL database with Drizzle ORM for persistent storage
- In-memory session storage using Map-based implementation
- localStorage for persisting user and league selections client-side

**Database Schema (Drizzle ORM):**
- Configuration present for PostgreSQL with Drizzle ORM
- Schema defined in `shared/schema.ts` using Zod for validation
- Use `npm run db:push` for schema migrations

**Data Models:**
- User sessions (Sleeper username, user ID, selected league)
- Player data (positions, stats, roster status)
- Team standings and matchups
- Transaction history
- Draft picks (traded and current ownership)
- Rule suggestions (league governance proposals with upvote/downvote voting)
- Award nominations (MVP and Rookie of Year nominations with voting)

### Authentication and Authorization

**Current Approach:**
- Username-based Sleeper account lookup (no password authentication)
- Session-based identification using randomly generated UUIDs
- Sessions stored in memory (ephemeral)
- User context persisted in localStorage between page reloads

**Security Considerations:**
- No sensitive data stored server-side
- All data sourced from public Sleeper API
- CORS and rate limiting available through Express middleware
- Session cleanup on user disconnect

## External Dependencies

### Third-Party APIs

**Sleeper API (Primary Data Source):**
- Base URL: `https://api.sleeper.app/v1`
- Endpoints used:
  - User lookup and leagues
  - League details, rosters, and users
  - Matchups and transactions
  - Traded draft picks
  - NFL state and all players data
  - Player statistics
- No authentication required (public API)
- Rate limiting handled client-side

### UI Libraries

**Radix UI Primitives:**
- Accordion, Dialog, Dropdown Menu, Select, Tabs, Toast, Tooltip
- Avatar, Badge, Button, Card, Checkbox, Input, Label
- Navigation Menu, Popover, Progress, Radio Group, Scroll Area
- Slider, Switch, Separator
- Provides accessible, unstyled component primitives

**shadcn/ui:**
- Pre-built component library built on Radix UI
- Customized with Tailwind configuration
- Component configuration in `components.json`

**Recharts:**
- Chart visualization library
- Used for player statistics graphs and trend lines
- Line charts, bar charts, and responsive containers

**Other UI Dependencies:**
- `cmdk` for command palette functionality
- `embla-carousel-react` for carousel components
- `date-fns` for date formatting
- `lucide-react` for icon library

### Development Tools

**Build Tools:**
- Vite for frontend bundling and development server
- esbuild for server-side bundling
- TypeScript compiler for type checking
- PostCSS with Tailwind CSS and Autoprefixer

**Development Plugins:**
- `@replit/vite-plugin-runtime-error-modal` for error overlay
- `@replit/vite-plugin-cartographer` for Replit integration
- `@replit/vite-plugin-dev-banner` for development banner

### Database and ORM

**Drizzle ORM:**
- Type-safe ORM for PostgreSQL
- Schema definition with TypeScript
- Migration management via `drizzle-kit`
- Integration with Zod for runtime validation

**Neon Serverless:**
- PostgreSQL database driver (`@neondatabase/serverless`)
- Optimized for serverless environments
- Connection pooling support

**Note:** PostgreSQL database is actively used for League Hub governance features (rule suggestions and award nominations). Sleeper data is proxied in real-time and cached client-side with React Query.