# Dynasty Fantasy Football Platform - Design Guidelines

## Design Approach
**System**: Custom design system inspired by modern sports analytics platforms (ESPN Fantasy, Yahoo Fantasy) combined with productivity tool patterns (Linear, Notion) to create a premium, data-dense interface optimized for serious fantasy managers.

**Core Principle**: Information density without overwhelming - every pixel serves the user's decision-making process.

---

## Typography System

**Font Families**:
- **Data/Tables**: Inter (400, 500, 600 weights)
- **Headings**: Poppins (600, 700 weights)

**Hierarchy**:
- Page Titles: Poppins 700, text-3xl (30px)
- Section Headers: Poppins 600, text-xl (20px)
- Card Titles: Poppins 600, text-lg (18px)
- Table Headers: Inter 600, text-sm (14px), uppercase, tracking-wide
- Body/Table Data: Inter 400, text-sm (14px)
- Metadata/Labels: Inter 500, text-xs (12px)
- Stats/Numbers: Inter 600, text-base (16px) - tabular-nums

---

## Layout & Spacing System

**Spacing Scale**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24 for consistency

**Container Strategy**:
- App shell: Full viewport with fixed sidebar (w-64)
- Main content: max-w-7xl with px-6 py-8
- Cards: p-6 for standard, p-4 for compact
- Tables: p-4 container, px-3 py-2 cells

**Grid Patterns**:
- Dashboard widgets: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 with gap-6
- Data tables: Full-width with fixed header
- Player cards: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 with gap-4

---

## Navigation Structure

**Primary Sidebar** (Fixed left, w-64):
- Logo/League name at top (h-16)
- Main navigation items with icons (h-12 each)
- Draft capital wallet widget (sticky at bottom, p-4)
- Navigation items: Dashboard, My Team, Trade Center, Draft Board, Standings, League Settings

**Top Bar** (Fixed, h-16):
- User profile dropdown (right)
- League switcher (if multi-league)
- Search players (center-left, w-96)
- Notification bell icon

---

## Component Library

### Dashboard Components

**Activity Feed**:
- Vertical timeline with transaction cards
- Each card: h-auto, p-4, flex layout
- Avatar (w-10 h-10) + transaction text + timestamp
- Filter pills above feed (All, Trades, Waivers, Adds/Drops)

**Matchup Preview Card**:
- Two-column layout with vs. indicator between
- Team logos (w-20 h-20)
- Projected scores (text-4xl, tabular-nums)
- Roster preview (5 player avatars, w-8 h-8 each, overlapping)

**Standings Table**:
- Sticky header, zebra striping
- Rank badge (w-6 h-6, rounded-full)
- Mini trend graph (w-20 h-8 sparkline)
- Columns: Rank, Team, W-L, PF, PA, Streak

**Draft Capital Wallet**:
- Horizontal pill badges for each pick
- Format: "2026 1st (via Team X)"
- Color-coded by round (1st brighter than 3rd)

### Roster Management Components

**Player Table**:
- Sortable columns with chevron indicators
- Row height: h-14
- Checkbox (w-5), Player name + photo (w-48), Position badge, Age, Stats columns
- Expandable rows for detailed stats (click to expand h-auto)
- Sticky column headers

**Lineup Optimizer**:
- Two-panel split (Starters left, Bench right)
- Drag handles on each player card
- Roster slot labels (QB, RB, RB, WR, WR, etc.) with empty state dashes
- Live validation indicators (green check, red X)

**Player Detail Modal**:
- Full-screen overlay with close button
- Header: Player photo (w-32 h-32), name, team, position
- Tabs: Stats, News, Schedule, Depth Chart
- Stats graph: Full-width, h-64, showing weekly points

### Position Depth Analysis

**Depth Chart Widget** (appears on My Team page):
- Position tabs (QB, RB, WR, TE, FLEX)
- Horizontal bar chart per player showing performance vs median
- Bars extend left (below median, red spectrum) or right (above median, green spectrum)
- Player name + photo on left, percentage value on right
- Median line clearly marked at center
- Overall position grade badge (A+, B-, etc.)

### Trade Center Components

**Two-Pane Selector**:
- Split screen: Your Team (left) | Their Team (right)
- Asset cards with checkboxes: Players (w-full, h-16), Draft Picks (w-full, h-12)
- Selected items move to "Offering" section below (h-32)
- Trade value meter between panes (vertical bar, h-full)

**Trade Analyzer**:
- Grade badge (w-16 h-16, A+ to F scale)
- Value breakdown table (Your Side: XXX pts, Their Side: XXX pts)
- Fairness indicator bar

**Trade History**:
- Timeline layout, newest first
- Each trade card: Date, Team A assets ↔ Team B assets
- Expandable for trade analyzer retrospective

### Draft Board

**Visual Draft Grid**:
- Table layout: Columns for each round (1-5 visible, scroll for more)
- Rows for each team
- Cell: Pick number, current owner badge (if traded)
- Future picks highlighted with year label
- Historical view: Player selected + team logo

---

## Data Visualization Patterns

**Charts** (using Recharts):
- Line charts: h-48 for inline, h-64 for featured
- Bar charts: h-40 for position comparisons
- Heatmaps: 7-day week view, h-32
- All charts: No background, minimal grid, subtle axis lines

**Badges & Indicators**:
- Position badges: px-2 py-1, rounded-md, text-xs font-semibold
- Status badges: rounded-full, px-3 py-1
- Numeric badges: tabular-nums, font-semibold

---

## Responsive Strategy

**Desktop First** (1280px+): Full feature set
**Tablet** (768-1279px): Sidebar collapses to rail, reduce columns to 2
**Mobile** (<768px): Bottom nav bar, stack all layouts, simplify tables to cards

---

## Images

**Hero Section**: Not applicable - this is a data application, not marketing site

**Player Photos**: 
- Headshots in tables/cards (w-10 h-10, rounded-full)
- Large player photo in detail modal (w-32 h-32, rounded-lg)
- Team logos throughout (w-8 h-8 standard, w-12 h-12 featured)

**Empty States**:
- Illustrated empty states for no data scenarios (w-64 h-64 centered graphics)