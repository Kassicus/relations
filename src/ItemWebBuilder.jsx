import React, { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

// Default data
const DEFAULT_CATEGORIES = [
  { id: "ui", name: "UI", color: "#60a5fa" },
  { id: "mechanics", name: "Mechanics", color: "#f472b6" },
  { id: "data", name: "Data", color: "#4ade80" },
  { id: "core", name: "Core", color: "#fbbf24" },
];

const DEFAULT_RELATIONSHIP_TYPES = [
  { id: "depends-on", name: "depends on", color: "#94a3b8", dashed: false },
  { id: "part-of", name: "part of", color: "#a78bfa", dashed: true },
  { id: "related-to", name: "related to", color: "#67e8f9", dashed: true },
];

// Storage keys
const STORAGE_KEY = "item-web-builder-data";

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load data:", e);
  }
  return {
    items: [],
    connections: [],
    categories: DEFAULT_CATEGORIES,
    relationshipTypes: DEFAULT_RELATIONSHIP_TYPES,
  };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save data:", e);
  }
}

// Generate unique IDs
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function ItemWebBuilder() {
  const [data, setData] = useState(loadData);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState("items");
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [showNewConnectionModal, setShowNewConnectionModal] = useState(false);
  const [pendingConnection, setPendingConnection] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingRelType, setEditingRelType] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const nodesRef = useRef([]);
  const dimensionsRef = useRef({ width: 800, height: 600 });

  // Save data whenever it changes (debounced to avoid excessive saves during simulation)
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveData(data);
    }, 500);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data]);

  // Calculate category centers based on current dimensions
  const getCategoryCenters = useCallback((width, height, categories) => {
    const categoryCount = categories.length || 1;
    const centers = {};
    categories.forEach((cat, i) => {
      const angle = (i / categoryCount) * 2 * Math.PI - Math.PI / 2;
      const radius = Math.min(width, height) * 0.25;
      centers[cat.id] = {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
      };
    });
    return centers;
  }, []);

  // Initialize zoom behavior (only once)
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 3])
      .filter((event) => {
        // Allow scroll/wheel zoom always
        if (event.type === 'wheel') return true;

        // Block zoom behavior on double-click (let React handle it)
        if (event.type === 'dblclick') return false;

        // Block zoom on shift+mousedown (for connecting nodes)
        if (event.type === 'mousedown' && event.shiftKey) return false;

        // Block pan/drag if mousedown is on a node element
        if (event.type === 'mousedown') {
          const target = event.target;
          // Check if the click target is inside a node group (has data-node-id)
          const nodeGroup = target.closest('[data-node-id]');
          if (nodeGroup) {
            return false; // This is a node, don't let zoom handle it
          }
        }

        return true;
      })
      .on("zoom", (event) => {
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
      });

    svg.call(zoom);

    // Disable D3's default double-click zoom
    svg.on("dblclick.zoom", null);
  }, []);

  // Initialize and update D3 simulation
  useEffect(() => {
    if (!svgRef.current) return;

    // Get dimensions with fallback
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;
    dimensionsRef.current = { width, height };

    const categoryCenters = getCategoryCenters(width, height, data.categories);

    // Create or update nodes
    const existingNodesMap = new Map(nodesRef.current.map(n => [n.id, n]));
    const nodes = data.items.map((item) => {
      const existing = existingNodesMap.get(item.id);
      if (existing) {
        // Keep existing position, update other properties
        return { ...existing, ...item, x: existing.x, y: existing.y };
      }
      // New node - place at category center
      const center = categoryCenters[item.category];
      return {
        ...item,
        x: item.x ?? center?.x ?? width / 2,
        y: item.y ?? center?.y ?? height / 2,
      };
    });
    nodesRef.current = nodes;

    // Create links
    const links = data.connections.map((conn) => ({
      ...conn,
      source: nodes.find((n) => n.id === conn.sourceId),
      target: nodes.find((n) => n.id === conn.targetId),
    })).filter((l) => l.source && l.target);

    // Stop existing simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Create simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("collision", d3.forceCollide().radius(45))
      .force("x", d3.forceX((d) => categoryCenters[d.category]?.x ?? width / 2).strength(0.15))
      .force("y", d3.forceY((d) => categoryCenters[d.category]?.y ?? height / 2).strength(0.15))
      .alphaDecay(0.02);

    simulationRef.current = simulation;

    // Throttle state updates to reduce re-renders
    let lastUpdate = 0;
    const updateInterval = 50; // Update state at most every 50ms

    simulation.on("tick", () => {
      const now = Date.now();
      if (now - lastUpdate < updateInterval) return;
      lastUpdate = now;

      // Update item positions in state using nodesRef for latest positions
      setData((prev) => {
        const currentNodes = nodesRef.current;
        const updated = { ...prev };
        updated.items = prev.items.map((item) => {
          const node = currentNodes.find((n) => n.id === item.id);
          if (node && (node.x !== item.x || node.y !== item.y)) {
            return { ...item, x: node.x, y: node.y };
          }
          return item;
        });
        return updated;
      });
    });

    // Restart simulation with higher alpha for new items
    simulation.alpha(1).restart();

    return () => {
      simulation.stop();
    };
  }, [data.items.length, data.connections.length, data.categories, getCategoryCenters]);

  // Handle node drag
  const handleNodeDrag = useCallback((itemId, dx, dy) => {
    // Scale the delta by the current zoom level
    const scaledDx = dx / transform.k;
    const scaledDy = dy / transform.k;

    // Update the simulation node directly
    if (simulationRef.current) {
      const simNode = simulationRef.current.nodes().find((n) => n.id === itemId);
      if (simNode) {
        // Update position and fix it in place during drag
        simNode.x = (simNode.x ?? 0) + scaledDx;
        simNode.y = (simNode.y ?? 0) + scaledDy;
        simNode.fx = simNode.x;
        simNode.fy = simNode.y;
      }
    }

    // Also update nodesRef to keep it in sync
    const nodeInRef = nodesRef.current.find((n) => n.id === itemId);
    if (nodeInRef) {
      nodeInRef.x = (nodeInRef.x ?? 0) + scaledDx;
      nodeInRef.y = (nodeInRef.y ?? 0) + scaledDy;
    }

    // Update React state
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, x: (item.x ?? 0) + scaledDx, y: (item.y ?? 0) + scaledDy }
          : item
      ),
    }));

    // Gently restart simulation to update links
    if (simulationRef.current) {
      simulationRef.current.alpha(0.1).restart();
    }
  }, [transform.k]);

  const handleNodeDragEnd = useCallback((itemId) => {
    if (simulationRef.current) {
      const node = simulationRef.current.nodes().find((n) => n.id === itemId);
      if (node) {
        // Release the fixed position so simulation can take over
        node.fx = null;
        node.fy = null;
      }
      // Small restart to let simulation settle
      simulationRef.current.alpha(0.05).restart();
    }
  }, []);

  // Add new item
  const addItem = (name, category) => {
    // Calculate initial position based on category center
    const { width, height } = dimensionsRef.current;
    const categoryCenters = getCategoryCenters(width, height, data.categories);
    const center = categoryCenters[category];

    // Add small random offset to prevent stacking
    const offset = () => (Math.random() - 0.5) * 60;

    const newItem = {
      id: generateId(),
      name,
      category,
      x: (center?.x ?? width / 2) + offset(),
      y: (center?.y ?? height / 2) + offset(),
    };
    setData((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setShowNewItemModal(false);
  };

  // Delete item
  const deleteItem = (itemId) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== itemId),
      connections: prev.connections.filter(
        (c) => c.sourceId !== itemId && c.targetId !== itemId
      ),
    }));
    setSelectedItem(null);
  };

  // Add connection
  const addConnection = (sourceId, targetId, relationshipType, bidirectional) => {
    // Check if connection already exists
    const exists = data.connections.some(
      (c) =>
        (c.sourceId === sourceId && c.targetId === targetId) ||
        (c.sourceId === targetId && c.targetId === sourceId)
    );
    if (exists) return;

    const newConnection = {
      id: generateId(),
      sourceId,
      targetId,
      relationshipType,
      bidirectional,
    };
    setData((prev) => ({
      ...prev,
      connections: [...prev.connections, newConnection],
    }));
    setShowNewConnectionModal(false);
    setPendingConnection(null);
    setConnectingFrom(null);
  };

  // Delete connection
  const deleteConnection = (connId) => {
    setData((prev) => ({
      ...prev,
      connections: prev.connections.filter((c) => c.id !== connId),
    }));
    setSelectedConnection(null);
  };

  // Add category
  const addCategory = () => {
    const newCat = {
      id: generateId(),
      name: "New Category",
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
    };
    setData((prev) => ({
      ...prev,
      categories: [...prev.categories, newCat],
    }));
    setEditingCategory(newCat.id);
  };

  // Update category
  const updateCategory = (catId, updates) => {
    setData((prev) => ({
      ...prev,
      categories: prev.categories.map((c) =>
        c.id === catId ? { ...c, ...updates } : c
      ),
    }));
  };

  // Delete category
  const deleteCategory = (catId) => {
    if (data.items.some((i) => i.category === catId)) {
      alert("Cannot delete category that has items. Reassign items first.");
      return;
    }
    setData((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== catId),
    }));
  };

  // Add relationship type
  const addRelationshipType = () => {
    const newRel = {
      id: generateId(),
      name: "new relationship",
      color: "#94a3b8",
      dashed: false,
    };
    setData((prev) => ({
      ...prev,
      relationshipTypes: [...prev.relationshipTypes, newRel],
    }));
    setEditingRelType(newRel.id);
  };

  // Update relationship type
  const updateRelationshipType = (relId, updates) => {
    setData((prev) => ({
      ...prev,
      relationshipTypes: prev.relationshipTypes.map((r) =>
        r.id === relId ? { ...r, ...updates } : r
      ),
    }));
  };

  // Delete relationship type
  const deleteRelationshipType = (relId) => {
    if (data.connections.some((c) => c.relationshipType === relId)) {
      alert("Cannot delete relationship type that is in use.");
      return;
    }
    setData((prev) => ({
      ...prev,
      relationshipTypes: prev.relationshipTypes.filter((r) => r.id !== relId),
    }));
  };

  // Export data
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "item-web-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import data
  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        setData(imported);
      } catch (err) {
        alert("Failed to import data: Invalid JSON");
      }
    };
    reader.readAsText(file);
  };

  // Get category by ID
  const getCategory = (catId) =>
    data.categories.find((c) => c.id === catId) || { name: "Unknown", color: "#666" };

  // Get relationship type by ID
  const getRelType = (relId) =>
    data.relationshipTypes.find((r) => r.id === relId) || {
      name: "unknown",
      color: "#666",
      dashed: false,
    };

  // Calculate arrow path
  const getArrowPath = (x1, y1, x2, y2, bidirectional) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { linePath: "", arrowPath: "", reverseArrowPath: "" };

    const unitX = dx / len;
    const unitY = dy / len;

    // Offset from node centers (node radius ~30)
    const startX = x1 + unitX * 32;
    const startY = y1 + unitY * 32;
    const endX = x2 - unitX * 32;
    const endY = y2 - unitY * 32;

    const linePath = `M ${startX} ${startY} L ${endX} ${endY}`;

    // Arrow head
    const arrowSize = 10;
    const arrowAngle = Math.PI / 6;
    const angle = Math.atan2(endY - startY, endX - startX);

    const arrow1X = endX - arrowSize * Math.cos(angle - arrowAngle);
    const arrow1Y = endY - arrowSize * Math.sin(angle - arrowAngle);
    const arrow2X = endX - arrowSize * Math.cos(angle + arrowAngle);
    const arrow2Y = endY - arrowSize * Math.sin(angle + arrowAngle);
    const arrowPath = `M ${endX} ${endY} L ${arrow1X} ${arrow1Y} M ${endX} ${endY} L ${arrow2X} ${arrow2Y}`;

    let reverseArrowPath = "";
    if (bidirectional) {
      const revAngle = angle + Math.PI;
      const revArrow1X = startX - arrowSize * Math.cos(revAngle - arrowAngle);
      const revArrow1Y = startY - arrowSize * Math.sin(revAngle - arrowAngle);
      const revArrow2X = startX - arrowSize * Math.cos(revAngle + arrowAngle);
      const revArrow2Y = startY - arrowSize * Math.sin(revAngle + arrowAngle);
      reverseArrowPath = `M ${startX} ${startY} L ${revArrow1X} ${revArrow1Y} M ${startX} ${startY} L ${revArrow2X} ${revArrow2Y}`;
    }

    return { linePath, arrowPath, reverseArrowPath };
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        background: "linear-gradient(135deg, #0f0f14 0%, #1a1a24 50%, #0f0f14 100%)",
        color: "#e2e8f0",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: "320px",
          background: "rgba(15, 15, 20, 0.95)",
          borderRight: "1px solid rgba(148, 163, 184, 0.1)",
          display: "flex",
          flexDirection: "column",
          backdropFilter: "blur(10px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
              background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "0.5px",
            }}
          >
            Item Web Builder
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#64748b" }}>
            Map your project architecture
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
          }}
        >
          {["items", "categories", "relationships"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "12px 8px",
                background: activeTab === tab ? "rgba(96, 165, 250, 0.1)" : "transparent",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid #60a5fa" : "2px solid transparent",
                color: activeTab === tab ? "#60a5fa" : "#64748b",
                fontSize: "11px",
                fontWeight: 500,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                fontFamily: "inherit",
                transition: "all 0.2s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          {activeTab === "items" && (
            <>
              <button
                onClick={() => setShowNewItemModal(true)}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  marginBottom: "16px",
                  fontFamily: "inherit",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(99, 102, 241, 0.4)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                + New Item
              </button>

              {data.items.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: "12px", textAlign: "center", marginTop: "40px" }}>
                  No items yet. Click above to add one, or click on the canvas.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data.items.map((item) => {
                    const cat = getCategory(item.category);
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedItem(item);
                          setSelectedConnection(null);
                        }}
                        style={{
                          padding: "12px",
                          background: selectedItem?.id === item.id
                            ? "rgba(96, 165, 250, 0.15)"
                            : "rgba(30, 30, 40, 0.5)",
                          border: selectedItem?.id === item.id
                            ? "1px solid rgba(96, 165, 250, 0.4)"
                            : "1px solid rgba(148, 163, 184, 0.1)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "12px",
                              height: "12px",
                              borderRadius: "50%",
                              background: cat.color,
                              boxShadow: `0 0 8px ${cat.color}50`,
                            }}
                          />
                          <span style={{ fontSize: "13px", fontWeight: 500 }}>{item.name}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", marginLeft: "22px" }}>
                          {cat.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "categories" && (
            <>
              <button
                onClick={addCategory}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  marginBottom: "16px",
                  fontFamily: "inherit",
                }}
              >
                + New Category
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {data.categories.map((cat) => (
                  <div
                    key={cat.id}
                    style={{
                      padding: "12px",
                      background: "rgba(30, 30, 40, 0.5)",
                      border: "1px solid rgba(148, 163, 184, 0.1)",
                      borderRadius: "8px",
                    }}
                  >
                    {editingCategory === cat.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <input
                          type="text"
                          value={cat.name}
                          onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                          style={{
                            padding: "8px",
                            background: "rgba(0, 0, 0, 0.3)",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            borderRadius: "4px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="color"
                            value={cat.color}
                            onChange={(e) => updateCategory(cat.id, { color: e.target.value })}
                            style={{ width: "40px", height: "30px", border: "none", cursor: "pointer" }}
                          />
                          <button
                            onClick={() => setEditingCategory(null)}
                            style={{
                              flex: 1,
                              padding: "8px",
                              background: "#3b82f6",
                              border: "none",
                              borderRadius: "4px",
                              color: "white",
                              fontSize: "12px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "4px",
                              background: cat.color,
                            }}
                          />
                          <span style={{ fontSize: "13px" }}>{cat.name}</span>
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            onClick={() => setEditingCategory(cat.id)}
                            style={{
                              padding: "4px 8px",
                              background: "rgba(148, 163, 184, 0.1)",
                              border: "none",
                              borderRadius: "4px",
                              color: "#94a3b8",
                              fontSize: "11px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCategory(cat.id)}
                            style={{
                              padding: "4px 8px",
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "none",
                              borderRadius: "4px",
                              color: "#ef4444",
                              fontSize: "11px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "relationships" && (
            <>
              <button
                onClick={addRelationshipType}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  marginBottom: "16px",
                  fontFamily: "inherit",
                }}
              >
                + New Relationship Type
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {data.relationshipTypes.map((rel) => (
                  <div
                    key={rel.id}
                    style={{
                      padding: "12px",
                      background: "rgba(30, 30, 40, 0.5)",
                      border: "1px solid rgba(148, 163, 184, 0.1)",
                      borderRadius: "8px",
                    }}
                  >
                    {editingRelType === rel.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <input
                          type="text"
                          value={rel.name}
                          onChange={(e) => updateRelationshipType(rel.id, { name: e.target.value })}
                          style={{
                            padding: "8px",
                            background: "rgba(0, 0, 0, 0.3)",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            borderRadius: "4px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="color"
                            value={rel.color}
                            onChange={(e) => updateRelationshipType(rel.id, { color: e.target.value })}
                            style={{ width: "40px", height: "30px", border: "none", cursor: "pointer" }}
                          />
                          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#94a3b8" }}>
                            <input
                              type="checkbox"
                              checked={rel.dashed}
                              onChange={(e) => updateRelationshipType(rel.id, { dashed: e.target.checked })}
                            />
                            Dashed
                          </label>
                          <button
                            onClick={() => setEditingRelType(null)}
                            style={{
                              flex: 1,
                              padding: "8px",
                              background: "#3b82f6",
                              border: "none",
                              borderRadius: "4px",
                              color: "white",
                              fontSize: "12px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "24px",
                              height: "3px",
                              background: rel.color,
                              borderRadius: "2px",
                              ...(rel.dashed && {
                                background: `repeating-linear-gradient(90deg, ${rel.color} 0px, ${rel.color} 4px, transparent 4px, transparent 8px)`,
                              }),
                            }}
                          />
                          <span style={{ fontSize: "13px" }}>{rel.name}</span>
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            onClick={() => setEditingRelType(rel.id)}
                            style={{
                              padding: "4px 8px",
                              background: "rgba(148, 163, 184, 0.1)",
                              border: "none",
                              borderRadius: "4px",
                              color: "#94a3b8",
                              fontSize: "11px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteRelationshipType(rel.id)}
                            style={{
                              padding: "4px 8px",
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "none",
                              borderRadius: "4px",
                              color: "#ef4444",
                              fontSize: "11px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "16px",
            borderTop: "1px solid rgba(148, 163, 184, 0.1)",
            display: "flex",
            gap: "8px",
          }}
        >
          <button
            onClick={exportData}
            style={{
              flex: 1,
              padding: "10px",
              background: "rgba(148, 163, 184, 0.1)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "6px",
              color: "#94a3b8",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Export JSON
          </button>
          <label
            style={{
              flex: 1,
              padding: "10px",
              background: "rgba(148, 163, 184, 0.1)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "6px",
              color: "#94a3b8",
              fontSize: "12px",
              cursor: "pointer",
              textAlign: "center",
              fontFamily: "inherit",
            }}
          >
            Import JSON
            <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Main Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <svg
          ref={svgRef}
          style={{ width: "100%", height: "100%", cursor: connectingFrom ? "crosshair" : "default" }}
          onMouseMove={(e) => {
            if (connectingFrom) {
              const rect = svgRef.current.getBoundingClientRect();
              setMousePos({
                x: (e.clientX - rect.left - transform.x) / transform.k,
                y: (e.clientY - rect.top - transform.y) / transform.k,
              });
            }
          }}
          onDoubleClick={(e) => {
            // Open modal if clicking on SVG background (not on nodes or connections)
            const targetTag = e.target.tagName.toLowerCase();
            const isBackground = targetTag === 'svg' || targetTag === 'rect' && e.target.dataset.background === 'true';
            if (isBackground) {
              setShowNewItemModal(true);
            }
          }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {/* Invisible background rect to capture mouse events */}
            <rect
              x={-10000}
              y={-10000}
              width={20000}
              height={20000}
              fill="transparent"
              data-background="true"
            />
            {/* Category zones (subtle background) */}
            {data.categories.map((cat, i) => {
              const catItems = data.items.filter((item) => item.category === cat.id);
              if (catItems.length === 0) return null;

              const avgX = catItems.reduce((sum, item) => sum + (item.x ?? 0), 0) / catItems.length;
              const avgY = catItems.reduce((sum, item) => sum + (item.y ?? 0), 0) / catItems.length;

              return (
                <g key={cat.id}>
                  <circle
                    cx={avgX}
                    cy={avgY}
                    r={80 + catItems.length * 20}
                    fill={`${cat.color}08`}
                    stroke={`${cat.color}20`}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={avgX}
                    y={avgY - 60 - catItems.length * 15}
                    textAnchor="middle"
                    fill={`${cat.color}60`}
                    fontSize="12"
                    fontFamily="inherit"
                    fontWeight="500"
                  >
                    {cat.name}
                  </text>
                </g>
              );
            })}

            {/* Connections */}
            {data.connections.map((conn) => {
              const source = data.items.find((i) => i.id === conn.sourceId);
              const target = data.items.find((i) => i.id === conn.targetId);
              if (!source || !target) return null;

              const relType = getRelType(conn.relationshipType);
              const { linePath, arrowPath, reverseArrowPath } = getArrowPath(
                source.x ?? 0,
                source.y ?? 0,
                target.x ?? 0,
                target.y ?? 0,
                conn.bidirectional
              );

              const isSelected = selectedConnection?.id === conn.id;

              return (
                <g
                  key={conn.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConnection(conn);
                    setSelectedItem(null);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <path
                    d={linePath}
                    stroke={isSelected ? "#fff" : relType.color}
                    strokeWidth={isSelected ? 3 : 2}
                    fill="none"
                    strokeDasharray={relType.dashed ? "6 4" : "none"}
                    style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
                  />
                  <path
                    d={arrowPath}
                    stroke={isSelected ? "#fff" : relType.color}
                    strokeWidth={isSelected ? 3 : 2}
                    fill="none"
                  />
                  {conn.bidirectional && (
                    <path
                      d={reverseArrowPath}
                      stroke={isSelected ? "#fff" : relType.color}
                      strokeWidth={isSelected ? 3 : 2}
                      fill="none"
                    />
                  )}
                  {/* Invisible wider path for easier clicking */}
                  <path d={linePath} stroke="transparent" strokeWidth="12" fill="none" />
                </g>
              );
            })}

            {/* Connecting line preview */}
            {connectingFrom && (
              <line
                x1={connectingFrom.x ?? 0}
                y1={connectingFrom.y ?? 0}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#60a5fa"
                strokeWidth="2"
                strokeDasharray="6 4"
                opacity="0.6"
              />
            )}

            {/* Nodes */}
            {data.items.map((item) => {
              const cat = getCategory(item.category);
              const isSelected = selectedItem?.id === item.id;
              const isConnecting = connectingFrom?.id === item.id;

              return (
                <g
                  key={item.id}
                  data-node-id={item.id}
                  transform={`translate(${item.x ?? 0}, ${item.y ?? 0})`}
                  style={{ cursor: connectingFrom && !isConnecting ? "crosshair" : "grab" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectingFrom && connectingFrom.id !== item.id) {
                      setPendingConnection({ source: connectingFrom, target: item });
                      setShowNewConnectionModal(true);
                    } else {
                      setSelectedItem(item);
                      setSelectedConnection(null);
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.shiftKey) {
                      e.stopPropagation();
                      e.preventDefault();
                      setConnectingFrom(item);
                      setMousePos({ x: item.x ?? 0, y: item.y ?? 0 });
                    } else if (!connectingFrom) {
                      e.stopPropagation();
                      e.preventDefault();
                      let lastX = e.clientX;
                      let lastY = e.clientY;

                      const handleMove = (moveEvent) => {
                        const dx = moveEvent.clientX - lastX;
                        const dy = moveEvent.clientY - lastY;
                        lastX = moveEvent.clientX;
                        lastY = moveEvent.clientY;
                        handleNodeDrag(item.id, dx, dy);
                      };

                      const handleUp = () => {
                        handleNodeDragEnd(item.id);
                        window.removeEventListener("mousemove", handleMove);
                        window.removeEventListener("mouseup", handleUp);
                      };

                      window.addEventListener("mousemove", handleMove);
                      window.addEventListener("mouseup", handleUp);
                    }
                  }}
                  onMouseUp={() => {
                    if (connectingFrom && connectingFrom.id !== item.id) {
                      setPendingConnection({ source: connectingFrom, target: item });
                      setShowNewConnectionModal(true);
                    }
                    setConnectingFrom(null);
                  }}
                >
                  {/* Outer glow */}
                  <circle
                    r={isSelected ? 38 : 32}
                    fill="none"
                    stroke={cat.color}
                    strokeWidth="2"
                    opacity={isSelected ? 0.6 : 0.2}
                    filter="url(#glow)"
                    style={{ transition: "all 0.2s" }}
                  />
                  {/* Main circle */}
                  <circle
                    r="28"
                    fill={`${cat.color}20`}
                    stroke={isSelected ? "#fff" : cat.color}
                    strokeWidth={isSelected ? 3 : 2}
                    style={{ transition: "all 0.2s" }}
                  />
                  {/* Label */}
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    fill="#e2e8f0"
                    fontSize="11"
                    fontFamily="inherit"
                    fontWeight="500"
                    style={{ pointerEvents: "none" }}
                  >
                    {item.name.length > 10 ? item.name.slice(0, 9) + "…" : item.name}
                  </text>
                  {/* Connect hint */}
                  {isSelected && !connectingFrom && (
                    <text
                      y="45"
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="9"
                      fontFamily="inherit"
                    >
                      Shift+drag to connect
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Selected Item Panel */}
        {selectedItem && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              width: "280px",
              background: "rgba(15, 15, 20, 0.95)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "12px",
              padding: "20px",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{selectedItem.name}</h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: getCategory(selectedItem.category).color }}>
                  {getCategory(selectedItem.category).name}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                style={{
                  padding: "4px 8px",
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "6px" }}>
                  Name
                </label>
                <input
                  type="text"
                  value={selectedItem.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setData((prev) => ({
                      ...prev,
                      items: prev.items.map((i) =>
                        i.id === selectedItem.id ? { ...i, name: newName } : i
                      ),
                    }));
                    setSelectedItem((prev) => ({ ...prev, name: newName }));
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "6px" }}>
                  Category
                </label>
                <select
                  value={selectedItem.category}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setData((prev) => ({
                      ...prev,
                      items: prev.items.map((i) =>
                        i.id === selectedItem.id ? { ...i, category: newCat } : i
                      ),
                    }));
                    setSelectedItem((prev) => ({ ...prev, category: newCat }));
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "13px",
                    fontFamily: "inherit",
                  }}
                >
                  {data.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: "8px" }}>
                <h4 style={{ fontSize: "11px", color: "#64748b", margin: "0 0 8px" }}>Connections</h4>
                {data.connections.filter(
                  (c) => c.sourceId === selectedItem.id || c.targetId === selectedItem.id
                ).length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#475569" }}>No connections yet</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {data.connections
                      .filter((c) => c.sourceId === selectedItem.id || c.targetId === selectedItem.id)
                      .map((conn) => {
                        const other = data.items.find(
                          (i) => i.id === (conn.sourceId === selectedItem.id ? conn.targetId : conn.sourceId)
                        );
                        const rel = getRelType(conn.relationshipType);
                        const isSource = conn.sourceId === selectedItem.id;

                        return (
                          <div
                            key={conn.id}
                            style={{
                              padding: "8px",
                              background: "rgba(0, 0, 0, 0.2)",
                              borderRadius: "4px",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {conn.bidirectional ? "↔" : isSource ? "→" : "←"}
                            <span style={{ color: rel.color }}>{rel.name}</span>
                            <span style={{ color: "#94a3b8" }}>{other?.name}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <button
                onClick={() => deleteItem(selectedItem.id)}
                style={{
                  marginTop: "12px",
                  padding: "10px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "6px",
                  color: "#ef4444",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Delete Item
              </button>
            </div>
          </div>
        )}

        {/* Selected Connection Panel */}
        {selectedConnection && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              width: "280px",
              background: "rgba(15, 15, 20, 0.95)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "12px",
              padding: "20px",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Connection</h3>
              <button
                onClick={() => setSelectedConnection(null)}
                style={{
                  padding: "4px 8px",
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "13px" }}>
                <span style={{ color: "#e2e8f0" }}>
                  {data.items.find((i) => i.id === selectedConnection.sourceId)?.name}
                </span>
                <span style={{ color: "#64748b", margin: "0 8px" }}>
                  {selectedConnection.bidirectional ? "↔" : "→"}
                </span>
                <span style={{ color: "#e2e8f0" }}>
                  {data.items.find((i) => i.id === selectedConnection.targetId)?.name}
                </span>
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "6px" }}>
                  Relationship Type
                </label>
                <select
                  value={selectedConnection.relationshipType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setData((prev) => ({
                      ...prev,
                      connections: prev.connections.map((c) =>
                        c.id === selectedConnection.id ? { ...c, relationshipType: newType } : c
                      ),
                    }));
                    setSelectedConnection((prev) => ({ ...prev, relationshipType: newType }));
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "13px",
                    fontFamily: "inherit",
                  }}
                >
                  {data.relationshipTypes.map((rel) => (
                    <option key={rel.id} value={rel.id}>
                      {rel.name}
                    </option>
                  ))}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectedConnection.bidirectional}
                  onChange={(e) => {
                    const bidir = e.target.checked;
                    setData((prev) => ({
                      ...prev,
                      connections: prev.connections.map((c) =>
                        c.id === selectedConnection.id ? { ...c, bidirectional: bidir } : c
                      ),
                    }));
                    setSelectedConnection((prev) => ({ ...prev, bidirectional: bidir }));
                  }}
                  style={{ width: "16px", height: "16px" }}
                />
                <span style={{ color: "#94a3b8" }}>Bidirectional</span>
              </label>

              <button
                onClick={() => deleteConnection(selectedConnection.id)}
                style={{
                  marginTop: "8px",
                  padding: "10px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "6px",
                  color: "#ef4444",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Delete Connection
              </button>
            </div>
          </div>
        )}

        {/* Help hint */}
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
            fontSize: "11px",
            color: "#475569",
            display: "flex",
            gap: "16px",
          }}
        >
          <span>Double-click: Add item</span>
          <span>Shift+drag: Connect</span>
          <span>Scroll: Zoom</span>
          <span>Drag canvas: Pan</span>
        </div>
      </div>

      {/* New Item Modal */}
      {showNewItemModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowNewItemModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20, 20, 30, 0.98)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "16px",
              padding: "24px",
              width: "360px",
              backdropFilter: "blur(10px)",
            }}
          >
            <h2 style={{ margin: "0 0 20px", fontSize: "18px", fontWeight: 600 }}>New Item</h2>
            <NewItemForm
              categories={data.categories}
              onSubmit={(name, category) => addItem(name, category)}
              onCancel={() => setShowNewItemModal(false)}
            />
          </div>
        </div>
      )}

      {/* New Connection Modal */}
      {showNewConnectionModal && pendingConnection && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setShowNewConnectionModal(false);
            setPendingConnection(null);
            setConnectingFrom(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20, 20, 30, 0.98)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "16px",
              padding: "24px",
              width: "360px",
              backdropFilter: "blur(10px)",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 600 }}>New Connection</h2>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
              {pendingConnection.source.name} → {pendingConnection.target.name}
            </p>
            <NewConnectionForm
              relationshipTypes={data.relationshipTypes}
              onSubmit={(relType, bidirectional) =>
                addConnection(pendingConnection.source.id, pendingConnection.target.id, relType, bidirectional)
              }
              onCancel={() => {
                setShowNewConnectionModal(false);
                setPendingConnection(null);
                setConnectingFrom(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent for New Item Form
function NewItemForm({ categories, onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]?.id || "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "6px" }}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter item name"
          autoFocus
          style={{
            width: "100%",
            padding: "12px",
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "14px",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              onSubmit(name.trim(), category);
            }
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "6px" }}>Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "14px",
            fontFamily: "inherit",
          }}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "12px",
            background: "rgba(148, 163, 184, 0.1)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "8px",
            color: "#94a3b8",
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => name.trim() && onSubmit(name.trim(), category)}
          disabled={!name.trim()}
          style={{
            flex: 1,
            padding: "12px",
            background: name.trim() ? "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)" : "#1e293b",
            border: "none",
            borderRadius: "8px",
            color: name.trim() ? "white" : "#475569",
            fontSize: "13px",
            cursor: name.trim() ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}

// Subcomponent for New Connection Form
function NewConnectionForm({ relationshipTypes, onSubmit, onCancel }) {
  const [relType, setRelType] = useState(relationshipTypes[0]?.id || "");
  const [bidirectional, setBidirectional] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "6px" }}>
          Relationship Type
        </label>
        <select
          value={relType}
          onChange={(e) => setRelType(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "14px",
            fontFamily: "inherit",
          }}
        >
          {relationshipTypes.map((rel) => (
            <option key={rel.id} value={rel.id}>
              {rel.name}
            </option>
          ))}
        </select>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={bidirectional}
          onChange={(e) => setBidirectional(e.target.checked)}
          style={{ width: "18px", height: "18px" }}
        />
        <span style={{ fontSize: "13px", color: "#e2e8f0" }}>Bidirectional relationship</span>
      </label>

      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "12px",
            background: "rgba(148, 163, 184, 0.1)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "8px",
            color: "#94a3b8",
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(relType, bidirectional)}
          style={{
            flex: 1,
            padding: "12px",
            background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}
