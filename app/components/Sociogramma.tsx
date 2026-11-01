"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ── Types ──────────────────────────────────────────────────────────────────

type Group = "famiglia" | "scuola" | "sport" | "lavoro" | "altro";
type Strength = "stretto" | "normale" | "conoscente";

interface Person {
  id: string;
  name: string;
  isMe?: boolean;
  group?: Group;
  notes?: string;
}

interface Link {
  source: string;
  target: string;
  label?: string;
  strength?: Strength;
}

interface GraphData {
  nodes: Person[];
  links: Link[];
}

type SimNode = Person & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & { label?: string; strength?: Strength };

// ── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "sociogramma-data-v2";

const GROUP_COLORS: Record<Group | "me", string> = {
  me:       "#6366f1",
  famiglia: "#f97316",
  scuola:   "#22c55e",
  sport:    "#eab308",
  lavoro:   "#06b6d4",
  altro:    "#8b5cf6",
};

const GROUP_STROKE: Record<Group | "me", string> = {
  me:       "#a5b4fc",
  famiglia: "#fdba74",
  scuola:   "#86efac",
  sport:    "#fde047",
  lavoro:   "#67e8f9",
  altro:    "#c4b5fd",
};

const GROUP_LABELS: Record<Group, string> = {
  famiglia: "Famiglia",
  scuola:   "Scuola",
  sport:    "Sport",
  lavoro:   "Lavoro",
  altro:    "Altro",
};

const STRENGTH_STYLES: Record<Strength, { width: number; dash: string; opacity: number }> = {
  stretto:    { width: 3,   dash: "none", opacity: 0.9 },
  normale:    { width: 2,   dash: "none", opacity: 0.7 },
  conoscente: { width: 1.5, dash: "6,4",  opacity: 0.5 },
};

const GROUPS = Object.keys(GROUP_LABELS) as Group[];

const defaultData: GraphData = {
  nodes: [
    { id: "pietro", name: "Pietro Caroti Ghelli", isMe: true },
    { id: "giacomo", name: "Giacomo Cunardi", group: "altro" },
  ],
  links: [{ source: "pietro", target: "giacomo", strength: "normale" }],
};

// ── Persistence ────────────────────────────────────────────────────────────

function loadData(): GraphData {
  if (typeof window === "undefined") return defaultData;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    // migrate old key
    const old = localStorage.getItem("sociogramma-data");
    if (old) {
      const parsed: GraphData = JSON.parse(old);
      return {
        nodes: parsed.nodes.map((n) => ({ ...n, group: n.group ?? "altro" })),
        links: parsed.links.map((l) => ({ ...l, strength: l.strength ?? "normale" })),
      };
    }
  } catch {}
  return defaultData;
}

function saveData(data: GraphData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Sociogramma() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<GraphData>(defaultData);

  // modals
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddLink,   setShowAddLink]   = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newGroup, setNewGroup] = useState<Group>("altro");
  const [linkFrom,     setLinkFrom]     = useState("");
  const [linkTo,       setLinkTo]       = useState("");
  const [linkLabel,    setLinkLabel]    = useState("");
  const [linkStrength, setLinkStrength] = useState<Strength>("normale");

  // side panel
  const [panelId, setPanelId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => { setData(loadData()); }, []);

  const redraw = useCallback(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const width  = svgEl.clientWidth  || 800;
    const height = svgEl.clientHeight || 600;
    const g = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (e) => g.attr("transform", e.transform))
    );

    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: width  / 2 + (Math.random() - 0.5) * 300,
      y: height / 2 + (Math.random() - 0.5) * 300,
    }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = data.links
      .map((l) => {
        const source = nodeById.get(l.source);
        const target = nodeById.get(l.target);
        if (!source || !target) return null;
        return { source, target, label: l.label, strength: l.strength ?? "normale" } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force("link",      d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(160))
      .force("charge",    d3.forceManyBody().strength(-450))
      .force("center",    d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>(60));

    // ── Links ──
    const linkGroup = g.append("g");

    const linkLine = linkGroup
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#4b5563")
      .attr("stroke-width",   (d) => STRENGTH_STYLES[d.strength ?? "normale"].width)
      .attr("stroke-dasharray", (d) => STRENGTH_STYLES[d.strength ?? "normale"].dash)
      .attr("stroke-opacity", (d) => STRENGTH_STYLES[d.strength ?? "normale"].opacity);

    // link labels
    const linkText = linkGroup
      .selectAll<SVGTextElement, SimLink>("text")
      .data(links.filter((l) => !!l.label))
      .join("text")
      .attr("text-anchor", "middle")
      .attr("fill", "#9ca3af")
      .attr("font-size", "10px")
      .attr("pointer-events", "none")
      .text((d) => d.label ?? "");

    // ── Nodes ──
    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer");

    node.call(
      d3.drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end",   (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

    node.on("click", (_event, d) => {
      setPanelId((prev) => (prev === d.id ? null : d.id));
    });

    node.append("circle")
      .attr("r", (d) => (d.isMe ? 36 : 28))
      .attr("fill",   (d) => d.isMe ? GROUP_COLORS.me  : GROUP_COLORS[d.group ?? "altro"])
      .attr("stroke", (d) => d.isMe ? GROUP_STROKE.me  : GROUP_STROKE[d.group ?? "altro"])
      .attr("stroke-width", 3);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "white")
      .attr("font-size",   (d) => (d.isMe ? "14px" : "12px"))
      .attr("font-weight", "bold")
      .attr("pointer-events", "none")
      .text((d) =>
        d.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
      );

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("y", (d) => (d.isMe ? 50 : 42))
      .attr("fill", "#e5e7eb")
      .attr("font-size", "11px")
      .attr("pointer-events", "none")
      .text((d) => d.name);

    simulation.on("tick", () => {
      linkLine
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      linkText
        .attr("x", (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr("y", (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2 - 6);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); };
  }, [data]);

  useEffect(() => {
    const cleanup = redraw();
    return cleanup ?? undefined;
  }, [redraw]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function addPerson() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    const updated: GraphData = {
      nodes: [...data.nodes, { id, name: trimmed, group: newGroup }],
      links: data.links,
    };
    setData(updated); saveData(updated);
    setNewName(""); setNewGroup("altro"); setShowAddPerson(false);
  }

  function addLink() {
    if (!linkFrom || !linkTo || linkFrom === linkTo) return;
    if (data.links.some((l) =>
      (l.source === linkFrom && l.target === linkTo) ||
      (l.source === linkTo   && l.target === linkFrom)
    )) return;
    const updated: GraphData = {
      nodes: data.nodes,
      links: [...data.links, {
        source: linkFrom, target: linkTo,
        label: linkLabel.trim() || undefined,
        strength: linkStrength,
      }],
    };
    setData(updated); saveData(updated);
    setLinkFrom(""); setLinkTo(""); setLinkLabel(""); setLinkStrength("normale");
    setShowAddLink(false);
  }

  function saveNotes() {
    if (!panelId) return;
    const updated: GraphData = {
      ...data,
      nodes: data.nodes.map((n) => n.id === panelId ? { ...n, notes: editNotes } : n),
    };
    setData(updated); saveData(updated); setEditingNotes(false);
  }

  function deletePerson(id: string) {
    const updated: GraphData = {
      nodes: data.nodes.filter((n) => n.id !== id),
      links: data.links.filter((l) => l.source !== id && l.target !== id),
    };
    setData(updated); saveData(updated); setPanelId(null);
  }

  function changeGroup(id: string, group: Group) {
    const updated: GraphData = {
      ...data,
      nodes: data.nodes.map((n) => n.id === id ? { ...n, group } : n),
    };
    setData(updated); saveData(updated);
  }

  const panelPerson = data.nodes.find((n) => n.id === panelId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-400 tracking-wide">Sociogramma</h1>
          {/* Legend */}
          <div className="hidden sm:flex gap-3 text-xs text-gray-400">
            {GROUPS.map((g) => (
              <span key={g} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: GROUP_COLORS[g] }} />
                {GROUP_LABELS[g]}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddPerson(true); setShowAddLink(false); }}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
          >+ Persona</button>
          <button
            onClick={() => { setShowAddLink(true); setShowAddPerson(false); }}
            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm font-medium transition-colors"
          >+ Connessione</button>
        </div>
      </header>

      {/* Body: graph + optional side panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Graph */}
        <div className="flex-1 relative">
          <svg ref={svgRef} className="w-full h-full" />
          <div className="absolute bottom-4 left-4 text-xs text-gray-600 space-y-0.5">
            <div>{data.nodes.length} persone · {data.links.length} connessioni</div>
            <div>trascina i nodi · scroll per zoom · click per scheda</div>
          </div>
          {/* Strength legend */}
          <div className="absolute bottom-4 right-4 text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-2"><span className="w-6 border-t-2 border-gray-400 inline-block" />Stretto</div>
            <div className="flex items-center gap-2"><span className="w-6 border-t-2 border-gray-500 inline-block" />Normale</div>
            <div className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-gray-600 inline-block" />Conoscente</div>
          </div>
        </div>

        {/* Side panel */}
        {panelPerson && (
          <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="font-semibold text-sm">Scheda persona</span>
              <button onClick={() => setPanelId(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
            </div>

            <div className="flex flex-col items-center pt-6 pb-4 px-4 gap-2">
              {/* Avatar */}
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold border-4"
                style={{
                  background: panelPerson.isMe ? GROUP_COLORS.me : GROUP_COLORS[panelPerson.group ?? "altro"],
                  borderColor: panelPerson.isMe ? GROUP_STROKE.me : GROUP_STROKE[panelPerson.group ?? "altro"],
                }}
              >
                {panelPerson.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <h2 className="text-base font-semibold text-center">{panelPerson.name}</h2>
              {panelPerson.isMe && <span className="text-xs text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded-full">Tu</span>}
            </div>

            {/* Group selector */}
            {!panelPerson.isMe && (
              <div className="px-4 pb-4">
                <label className="text-xs text-gray-400 mb-1 block">Gruppo</label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUPS.map((g) => (
                    <button
                      key={g}
                      onClick={() => changeGroup(panelPerson.id, g)}
                      className="px-2 py-1 rounded-full text-xs font-medium border transition-all"
                      style={{
                        background: panelPerson.group === g ? GROUP_COLORS[g] : "transparent",
                        borderColor: GROUP_COLORS[g],
                        color: panelPerson.group === g ? "white" : GROUP_COLORS[g],
                      }}
                    >
                      {GROUP_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Connections */}
            <div className="px-4 pb-4">
              <label className="text-xs text-gray-400 mb-1 block">Connessioni</label>
              <div className="space-y-1">
                {data.links
                  .filter((l) => l.source === panelPerson.id || l.target === panelPerson.id)
                  .map((l, i) => {
                    const otherId = l.source === panelPerson.id ? l.target : l.source;
                    const other = data.nodes.find((n) => n.id === otherId);
                    if (!other) return null;
                    return (
                      <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-2 py-1.5 text-xs">
                        <span className="text-gray-200">{other.name}</span>
                        <div className="flex items-center gap-1.5 text-gray-400">
                          {l.label && <span className="italic">{l.label}</span>}
                          <span className={
                            l.strength === "stretto" ? "text-green-400" :
                            l.strength === "conoscente" ? "text-gray-500" : "text-gray-400"
                          }>
                            {l.strength ?? "normale"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Notes */}
            <div className="px-4 pb-4 flex-1">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">Note</label>
                {!editingNotes && (
                  <button
                    onClick={() => { setEditNotes(panelPerson.notes ?? ""); setEditingNotes(true); }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >Modifica</button>
                )}
              </div>
              {editingNotes ? (
                <div>
                  <textarea
                    autoFocus
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={4}
                    className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-600 focus:border-indigo-500 outline-none text-xs resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setEditingNotes(false)} className="text-xs text-gray-400 hover:text-gray-200">Annulla</button>
                    <button onClick={saveNotes} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Salva</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 whitespace-pre-wrap min-h-[2rem]">
                  {panelPerson.notes || <span className="italic text-gray-600">Nessuna nota</span>}
                </p>
              )}
            </div>

            {/* Delete */}
            {!panelPerson.isMe && (
              <div className="px-4 pb-4 mt-auto">
                <button
                  onClick={() => deletePerson(panelPerson.id)}
                  className="w-full py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 text-sm transition-colors"
                >
                  Rimuovi persona
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Modal: Add Person */}
      {showAddPerson && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Aggiungi persona</h2>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPerson()}
              placeholder="Nome e cognome"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-indigo-500 outline-none text-sm mb-3"
            />
            <label className="text-xs text-gray-400 mb-1.5 block">Gruppo</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {GROUPS.map((g) => (
                <button
                  key={g}
                  onClick={() => setNewGroup(g)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                  style={{
                    background: newGroup === g ? GROUP_COLORS[g] : "transparent",
                    borderColor: GROUP_COLORS[g],
                    color: newGroup === g ? "white" : GROUP_COLORS[g],
                  }}
                >
                  {GROUP_LABELS[g]}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddPerson(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">Annulla</button>
              <button onClick={addPerson} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Aggiungi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Link */}
      {showAddLink && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Aggiungi connessione</h2>
            <select value={linkFrom} onChange={(e) => setLinkFrom(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 outline-none text-sm mb-2">
              <option value="">Da...</option>
              {data.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 outline-none text-sm mb-3">
              <option value="">A...</option>
              {data.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Etichetta (es. amico, collega…)"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 outline-none text-sm mb-3"
            />
            <label className="text-xs text-gray-400 mb-1.5 block">Intensità del legame</label>
            <div className="flex gap-2 mb-4">
              {(["stretto", "normale", "conoscente"] as Strength[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setLinkStrength(s)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                    linkStrength === s
                      ? "bg-blue-700 border-blue-500 text-white"
                      : "border-gray-600 text-gray-400 hover:border-gray-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddLink(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">Annulla</button>
              <button onClick={addLink} className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm font-medium">Collega</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
