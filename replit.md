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
- My Team page with tabs:
  - Roster tab: Player table and position depth chart
  - Rivalry tab: Historical head-to-head records against all league opponents
    - Traverses previous_league_id to collect data across all dynasty seasons
    - Shows W-L-T record, win rate, point differential, and dominance status
    - Expandable rows with match history showing season/week breakdown
    - Summary cards: All-time record, seasons tracked, best/toughest matchups
- Trade center with two-pane asset selection interface
- Draft board for future draft capital visualization (3 rounds, with historical data)
- League Hub for governance (rule suggestions and award voting)
- Real-time data syncing with Sleeper API
- Unified matchup view with positional comparison and dual-sided bar graphs
- Player detail popup on matchup page (click any player name):
  - Season performance line graph showing actual points per week
  - Projected totals shown as dashed line overlay
  - Boom/bust percentages for the selected week
  - Player info badges (age, experience, height/weight, college)
  - Relevant news (injury status, practice participation, depth chart position)
- Automatic lineup optimization: inactive (Out/IR/PUP/Sus/NFI/COV) and bye week players auto-replaced with eligible bench players
- Personalized boom-bust metrics using 8-week rolling window of actual player performance
- Position depth chart showing points above/below median (e.g., "+15.2 pts")
- Advanced Metrics page with Team Luck analysis:
  - Calculates luck based on weekly score vs league median
  - +1 for lucky wins (won below median), -1 for unlucky losses (lost above median)
  - Summary cards showing luckiest team, unluckiest team, and user's luck
  - Expandable weekly breakdown with color-coded indicators
  - Team Luck Rankings table with weekly luck visualization
- Heat Check tab on Metrics page:
  - Compares each team's last 4 weeks average to their season average before those 4 weeks
  - Hot teams (red): scoring above their baseline with positive difference
  - Cold teams (blue): scoring below their baseline with negative difference
  - Shows difference amount and percentage change
  - Heat levels: On Fire/Ice Cold (20+), Hot/Cold (10+), Warming Up/Cooling Down (5+)
  - Summary cards: Hottest team, coldest team, and user's team heat status
- Playoff predictor with points standings impact analysis:
  - PF Rank showing each team's points-for standings position
  - Points gaps to adjacent teams (behind/ahead)
  - Impact analysis showing playoff odds changes if moving up/down in points standings
  - Monte Carlo simulation with 10,000 iterations
- Standings with win/loss streak calculation (e.g., "W3", "L2", "—")
- Draft odds calculator (Draft Odds tab):
  - Monte Carlo simulation with 10,000 iterations for probabilistic pick assignment
  - Eliminated teams (0% playoff odds): compete for picks 1-5 based on max points
  - Clinched teams (100% playoff odds): compete for picks 6-12 based on playoff finish
  - Bubble teams (partial playoff odds): have probability spread across all 12 picks
  - Visual highlighting shows probability distribution with stronger colors for higher odds
- Auto-selection of most recent completed draft in Historical tab (prefers 2024 if available)
- Trophy Room page showcasing dynasty history:
  - Season Champions trophy case with all past champions
  - Highest Scorers trophy case (only awarded after regular season ends at playoff start week)
  - MVP Award winners from league voting
  - Rookie of the Year winners from league voting
  - Best GM Award winners from league voting
  - Reigning champions banner highlighting current title holders
  - Trophy summary with total counts for each award type
  - Traverses previous_league_id to collect complete dynasty history
- League Hub governance with configurable lock dates:
  - Nominations and proposals lock on December 9, 2025 at 12pm EST
  - Vote results always visible (no hidden voting period)
  - Voting remains open after nominations lock
  - Three award categories: MVP, Rookie of the Year, and Best GM
  - Best GM nominations select from team managers instead of players
  - All awards use same ranked voting system (1st = 3pts, 2nd = 2pts, 3rd = 1pt)
  - Point totals hidden from regular members by default (shown as eye-off icon)
  - Commissioner can view hidden point totals (shown with eye icon indicator)
  - Commissioner toggle to reveal/hide point totals for all members
- Contracts page with salary cap management ($250M per team):
  - Overview tab: League-wide salary utilization with team pie charts
  - Expiring Contracts tab: Players in final contract year with analytics
  - Manage Team Contracts tab: Hypothetical planning without affecting official contracts
  - Player Bidding tab: Private bids on free agents (team-specific visibility)
    - Search free agents and place bids with amount, max bid, and contract years
    - Bids are stored in database and visible only to the team that placed them
    - Edit or delete bids at any time
    - Privacy indicator showing bids are private to your team
  - Manage League Contracts tab (commissioner-only): Official contract management
    - Salary inputs for 4 contract years (2025-2028)
    - Dead cap calculations with year-based percentages
    - Fifth-year option tracking for rookie contracts
    - IR Void toggle: Commissioner can void a player's current year contract when placed on IR
      - IR toggle per player voids their 2025 salary (shows "IR VOID" badge)
      - Voided salary excluded from team cap totals
      - Original salary shown with strikethrough for reference
    - Contracts persist in PostgreSQL database

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

**Database Tables (Persistent Storage):**
- `rule_suggestions` - League governance proposals (persists across republishing)
- `rule_votes` - Team votes on rule proposals (persists across republishing)
- `award_nominations` - MVP and ROY player nominations (persists across republishing)
- `award_ballots` - Ranked voting ballots for awards (persists across republishing)
- `player_contracts` - Commissioner-managed salary contracts (persists across republishing)
- `player_bids` - Team-specific private bids on free agents (persists across republishing)

**Data Models:**
- User sessions (Sleeper username, user ID, selected league) - in-memory, ephemeral
- Player data (positions, stats, roster status) - from Sleeper API
- Team standings and matchups - from Sleeper API
- Transaction history - from Sleeper API
- Draft picks (traded and current ownership) - from Sleeper API
- Rule suggestions and votes - PostgreSQL database (persistent)
- Award nominations and ballots - PostgreSQL database (persistent)
- Player contracts - PostgreSQL database (persistent)
- Player bids - PostgreSQL database (persistent, team-private)

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