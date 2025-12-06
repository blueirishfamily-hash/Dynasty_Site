# Dynasty Command - Fantasy Football League Manager

## Overview

Dynasty Command is a premium Dynasty Fantasy Football League Management Platform that integrates with the Sleeper API to provide advanced analytics, trade management, and draft capital tracking. It offers a data-dense, modern interface inspired by leading sports analytics and productivity platforms. The platform targets dedicated fantasy football managers seeking deep statistical analysis, complex trade tools, and comprehensive league history beyond the native Sleeper interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript, Vite, Wouter (routing), TanStack Query (server state), shadcn/ui (component library with Radix UI), and Tailwind CSS.

**Design System:**
- Custom `shadcn/ui` theme ("new-york" style), Inter and Poppins typography, desktop-first responsive design, dark mode, and a neutral palette with a teal accent.

**Key Features:**
- **Dashboard:** Activity feed, matchup preview, standings.
- **Team Management:** Roster, depth charts, historical rivalry tracking across seasons.
- **Trade Center:** Two-pane asset selection.
- **Draft Board:** Future draft capital visualization with historical data.
- **League Hub:** Governance (rule suggestions, award voting), configurable lock dates, commissioner controls for award visibility and contract approvals.
- **Real-time Data Syncing:** With Sleeper API.
- **Matchup View:** Positional comparison, player detail popups with performance graphs, projections, and news.
- **Lineup Optimization:** Automatic replacement of inactive/bye week players.
- **Advanced Metrics:**
    - **Team Luck:** Calculates luck based on weekly score vs. league median, with summary and weekly breakdown.
    - **Heat Check:** Compares recent 4-week performance to season average, categorizing teams as "Hot" or "Cold".
    - **Playoff Predictor:** Points standings impact analysis, Monte Carlo simulation for playoff odds.
    - **Draft Odds Calculator:** Monte Carlo simulation for probabilistic pick assignments, considering playoff status.
- **Standings:** With win/loss streak calculation.
- **Trophy Room:** Showcases dynasty history, including season champions, highest scorers, and voted awards (MVP, ROY, Best GM), leveraging `previous_league_id` for full history.
- **Contracts Page:** Salary cap management ($250M), including:
    - **Overview:** League-wide salary utilization.
    - **Expiring Contracts:** Analytics for players in their final year.
    - **Manage Team Contracts:** Contract planning with franchise tag, extension options, draft saving, and submission for commissioner approval.
    - **Player Bidding:** Private bids on free agents with contract limits.
    - **Manage League Contracts (Commissioner-only):** Official contract management with salary inputs, dead cap, fifth-year options, and IR void toggles.
    - **Approvals (Commissioner-only):** Review and manage pending team contract submissions.

### Backend Architecture

**Technology Stack:**
- Express.js server with TypeScript, HTTP server, in-memory session management, and RESTful API design.

**API Structure:**
- Proxies to Sleeper API (`/api/sleeper/*`), session management endpoints, and a data transformation layer.

**Data Flow:**
- Frontend requests via TanStack Query, backend proxies to Sleeper API, responses are transformed/enriched, and results are cached client-side.

### Data Storage Solutions

**Current Implementation:**
- PostgreSQL database with Drizzle ORM for persistent storage.
- In-memory Map-based session storage.
- `localStorage` for client-side user/league selections.

**Database Tables (Persistent Storage):**
- `rule_suggestions`, `rule_votes`, `award_nominations`, `award_ballots`, `player_contracts`, `player_bids`, `contract_approval_requests`. These persist across republishing.

### Authentication and Authorization

**Current Approach:**
- Username-based Sleeper account lookup (no password).
- Session-based identification (UUIDs) stored in memory.
- User context persisted in `localStorage`.

## External Dependencies

### Third-Party APIs

- **Sleeper API:** Primary data source for user/league data, rosters, matchups, transactions, draft picks, NFL state, players, and stats. No authentication required.

### UI Libraries

- **Radix UI Primitives:** Accessible, unstyled components (Accordion, Dialog, Dropdown Menu, Select, Tabs, Toast, Tooltip, Avatar, Badge, Button, Card, Checkbox, Input, Label, Navigation Menu, Popover, Progress, Radio Group, Scroll Area, Slider, Switch, Separator).
- **shadcn/ui:** Pre-built component library based on Radix UI.
- **Recharts:** Chart visualization for graphs and trend lines (line, bar charts).
- **Other UI:** `cmdk` (command palette), `embla-carousel-react` (carousel), `date-fns` (date formatting), `lucide-react` (icons).

### Database and ORM

- **Drizzle ORM:** Type-safe ORM for PostgreSQL, schema definition, migration management (`drizzle-kit`), Zod validation.
- **Neon Serverless:** PostgreSQL database driver (`@neondatabase/serverless`) for serverless environments with connection pooling.