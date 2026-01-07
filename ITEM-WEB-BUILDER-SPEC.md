# Item Web Builder

A lightweight dev tool for visually mapping project architecture, dependencies, and relationships as an interactive node graph.

## Project Overview

### Purpose
A single-page web application that allows developers to:
- Create items (nodes) representing components, features, or concepts
- Organize items into categories that visually cluster together
- Define relationships between items with customizable types
- Visualize everything as an interactive force-directed graph

### Use Case
This is primarily a development planning tool for mapping out:
- Feature dependencies
- Component relationships
- System architecture
- Data flow
- Any conceptual web of related items

---

## Technical Stack

### Core
- **React** (with hooks)
- **Vite** for build tooling
- **D3.js** for force simulation and graph visualization

### Styling
- CSS-in-JS (inline styles) or CSS modules
- Dark theme with accent colors
- Monospace font family (JetBrains Mono / Fira Code)

### Data Persistence
- **localStorage** for auto-save
- **JSON export/import** for backup and portability

### No Backend Required
This is a fully client-side application.

---

## Data Models

### Item
```typescript
interface Item {
  id: string;           // Unique identifier (timestamp + random)
  name: string;         // Display name
  category: string;     // Reference to Category.id
  x?: number;           // Canvas X position (managed by simulation)
  y?: number;           // Canvas Y position (managed by simulation)
}
```

### Connection
```typescript
interface Connection {
  id: string;                 // Unique identifier
  sourceId: string;           // Reference to source Item.id
  targetId: string;           // Reference to target Item.id
  relationshipType: string;   // Reference to RelationshipType.id
  bidirectional: boolean;     // If true, arrows on both ends
}
```

### Category
```typescript
interface Category {
  id: string;      // Unique identifier
  name: string;    // Display name (e.g., "UI", "Backend", "Data")
  color: string;   // Hex color for visual identification
}
```

### RelationshipType
```typescript
interface RelationshipType {
  id: string;       // Unique identifier
  name: string;     // Display name (e.g., "depends on", "part of")
  color: string;    // Hex color for the edge
  dashed: boolean;  // If true, render as dashed line
}
```

### AppState
```typescript
interface AppState {
  items: Item[];
  connections: Connection[];
  categories: Category[];
  relationshipTypes: RelationshipType[];
}
```

---

## Default Data

### Categories
| Name | Color | Purpose |
|------|-------|---------|
| UI | `#60a5fa` (blue) | Frontend/interface components |
| Mechanics | `#f472b6` (pink) | Game/app logic |
| Data | `#4ade80` (green) | Data structures, storage |
| Core | `#fbbf24` (amber) | Core systems, foundations |

### Relationship Types
| Name | Color | Style | Purpose |
|------|-------|-------|---------|
| depends on | `#94a3b8` (slate) | solid | Hard dependency |
| part of | `#a78bfa` (violet) | dashed | Composition/containment |
| related to | `#67e8f9` (cyan) | dashed | Loose association |

---

## Features

### Graph Visualization

#### Force Simulation
- Nodes repel each other (charge force)
- Connected nodes attract (link force)
- Nodes cluster toward their category center (positioning force)
- Collision detection prevents overlap

#### Category Clustering
- Calculate category "center of mass" based on member positions
- Apply gentle force pulling items toward their category center
- Display subtle dashed circle around category clusters
- Show category label above cluster

#### Edges
- Directional: single arrowhead at target
- Bidirectional: arrowheads at both ends
- Color and dash pattern based on relationship type
- Clickable for selection/editing

### Interactions

#### Canvas
| Action | Result |
|--------|--------|
| Double-click empty space | Open "New Item" modal |
| Scroll / Pinch | Zoom in/out |
| Drag empty space | Pan canvas |

#### Nodes
| Action | Result |
|--------|--------|
| Click | Select item (shows detail panel) |
| Drag | Reposition node |
| Shift + Drag | Start connection (drag to target) |

#### Edges
| Action | Result |
|--------|--------|
| Click | Select connection (shows detail panel) |

### Sidebar

#### Tabs
1. **Items** - List all items, add new items
2. **Categories** - Manage categories (add/edit/delete)
3. **Relationships** - Manage relationship types (add/edit/delete)

#### Item List Entry
- Color dot indicating category
- Item name
- Category name (secondary text)
- Click to select (highlights in graph)

#### Category Editor
- Name input
- Color picker
- Delete button (blocked if category has items)

#### Relationship Type Editor
- Name input
- Color picker
- Dashed checkbox
- Delete button (blocked if type is in use)

### Detail Panels

#### Selected Item Panel (top-right overlay)
- Item name (editable)
- Category dropdown (editable)
- List of connections involving this item
- Delete button

#### Selected Connection Panel (top-right overlay)
- Source → Target display
- Relationship type dropdown (editable)
- Bidirectional checkbox (editable)
- Delete button

### Data Management

#### Auto-Save
- Save to localStorage on every state change
- Load from localStorage on app init

#### Export
- Download current state as JSON file
- Filename: `item-web-data.json`

#### Import
- File picker for JSON upload
- Replace current state with imported data

---

## UI Specifications

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌────────────────────────────────────────┐ │
│ │          │ │                                        │ │
│ │ Sidebar  │ │         Canvas (SVG)                   │ │
│ │ 320px    │ │                                        │ │
│ │          │ │                          ┌───────────┐ │ │
│ │          │ │                          │Detail     │ │ │
│ │          │ │                          │Panel      │ │ │
│ │          │ │                          └───────────┘ │ │
│ │          │ │  ┌─────────────────────────────────┐   │ │
│ │          │ │  │ Help hints (bottom-left)        │   │ │
│ └──────────┘ └──┴─────────────────────────────────┴───┘ │
└─────────────────────────────────────────────────────────┘
```

### Color Palette
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0f0f14` | Main background |
| `--bg-secondary` | `#1a1a24` | Sidebar, panels |
| `--bg-tertiary` | `#1e1e2a` | Inputs, cards |
| `--border` | `rgba(148, 163, 184, 0.1)` | Subtle borders |
| `--text-primary` | `#e2e8f0` | Main text |
| `--text-secondary` | `#94a3b8` | Secondary text |
| `--text-muted` | `#64748b` | Muted/hint text |
| `--accent-blue` | `#60a5fa` | Primary accent |
| `--accent-purple` | `#6366f1` | Secondary accent |
| `--danger` | `#ef4444` | Delete actions |

### Typography
- **Font Family**: `'JetBrains Mono', 'Fira Code', monospace`
- **Headings**: 16-18px, weight 600
- **Body**: 13px, weight 400
- **Labels**: 11px, weight 500, uppercase, letter-spacing 0.5px

### Node Appearance
- Circle with radius 28px
- Fill: category color at 20% opacity
- Stroke: category color (white when selected)
- Outer glow effect on hover/selection
- Text label centered (truncate with ellipsis if > 10 chars)

### Edge Appearance
- Stroke width: 2px (3px when selected)
- Arrowhead: 10px equilateral triangle
- Dashed: `strokeDasharray="6 4"`

---

## Project Structure

```
item-web-builder/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── ItemsTab.jsx
│   │   │   ├── CategoriesTab.jsx
│   │   │   └── RelationshipsTab.jsx
│   │   ├── Canvas/
│   │   │   ├── Canvas.jsx
│   │   │   ├── Node.jsx
│   │   │   ├── Edge.jsx
│   │   │   └── CategoryZone.jsx
│   │   ├── Panels/
│   │   │   ├── ItemPanel.jsx
│   │   │   └── ConnectionPanel.jsx
│   │   └── Modals/
│   │       ├── NewItemModal.jsx
│   │       └── NewConnectionModal.jsx
│   ├── hooks/
│   │   ├── useSimulation.js
│   │   ├── useStorage.js
│   │   └── useZoom.js
│   ├── utils/
│   │   ├── geometry.js      // Arrow path calculations
│   │   ├── storage.js       // localStorage helpers
│   │   └── id.js            // ID generation
│   ├── data/
│   │   └── defaults.js      // Default categories, relationship types
│   └── styles/
│       └── index.css        // Global styles, CSS variables
└── README.md
```

---

## Implementation Notes

### Force Simulation Configuration
```javascript
d3.forceSimulation(nodes)
  .force("link", d3.forceLink(links).id(d => d.id).distance(120).strength(0.3))
  .force("charge", d3.forceManyBody().strength(-300))
  .force("collision", d3.forceCollide().radius(45))
  .force("x", d3.forceX(d => categoryCenters[d.category].x).strength(0.15))
  .force("y", d3.forceY(d => categoryCenters[d.category].y).strength(0.15))
  .alphaDecay(0.02)
```

### Zoom Setup
```javascript
d3.zoom()
  .scaleExtent([0.2, 3])
  .on("zoom", (event) => setTransform(event.transform))
```

### Node Drag Behavior
- On drag: set `fx` and `fy` to fix position temporarily
- On drag end: clear `fx` and `fy` to release to simulation
- Restart simulation with low alpha on drag

### Connection Creation Flow
1. User shift+drags from source node
2. Preview line follows cursor
3. User releases on target node
4. Modal opens to select relationship type and bidirectional option
5. Connection created on confirm

### Preventing Duplicate Connections
Before adding a connection, check if one already exists between the same two nodes (in either direction).

---

## Future Enhancements (Optional)

- [ ] Search/filter items
- [ ] Filter view by category or relationship type
- [ ] Node descriptions/notes field
- [ ] Undo/redo support
- [ ] Multiple selection (shift+click)
- [ ] Copy/paste items
- [ ] Keyboard shortcuts
- [ ] Mini-map for large graphs
- [ ] Snap-to-grid option
- [ ] Custom node shapes per category
- [ ] Connection labels displayed on hover
- [ ] Graph layout algorithms (tree, radial, hierarchical)

---

## Getting Started

```bash
# Create project
npm create vite@latest item-web-builder -- --template react

# Install dependencies
cd item-web-builder
npm install d3

# Start dev server
npm run dev
```

---

## Reference Implementation

A working single-file React implementation exists as `item-web-builder.jsx`. This can be used as reference or as a starting point to refactor into the component structure above.
