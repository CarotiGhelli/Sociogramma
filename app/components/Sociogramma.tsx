"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

interface Person {
  id: string;
  name: string;
  isMe?: boolean;
}

interface Link {
  source: string;
  target: string;
}

interface GraphData {
  nodes: Person[];
  links: Link[];
}

type SimNode = Person & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode>;

const STORAGE_KEY = "sociogramma-data";

const defaultData: GraphData = {
  nodes: [
    { id: "pietro", name: "Pietro Caroti Ghelli", isMe: true },
    { id: "giacomo", name: "Giacomo Cunardi" },
  ],
  links: [{ source: "pietro", target: "giacomo" }],
};

function loadData(): GraphData {
  if (typeof window === "undefined") return defaultData;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultData;
}

function saveData(data: GraphData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export default function Sociogramma() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<GraphData>(defaultData);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newName, setNewName] = useState("");
  const [linkFrom, setLinkFrom] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    setData(loadData());
  }, []);

  const redraw = useCallback(() => {
    if (!svgRef.current) return;

    const svgEl = svgRef.current;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 600;

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = data.links
      .map((l) => {
        const source = nodeById.get(l.source);
        const target = nodeById.get(l.target);
        if (!source || !target) return null;
        return { source, target } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(140))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>(55));

    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.7);

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
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    node.on("click", (_event, d) => {
      setSelectedNode((prev) => (prev === d.id ? null : d.id));
    });

    node
      .append("circle")
      .attr("r", (d) => (d.isMe ? 36 : 28))
      .attr("fill", (d) => (d.isMe ? "#6366f1" : "#3b82f6"))
      .attr("stroke", (d) => (d.isMe ? "#a5b4fc" : "#93c5fd"))
      .attr("stroke-width", 3);

    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "white")
      .attr("font-size", (d) => (d.isMe ? "14px" : "12px"))
      .attr("font-weight", "bold")
      .attr("pointer-events", "none")
      .text((d) =>
        d.name
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      );

    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", (d) => (d.isMe ? 50 : 42))
      .attr("fill", "#e5e7eb")
      .attr("font-size", "12px")
      .attr("pointer-events", "none")
      .text((d) => d.name);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); };
  }, [data]);

  useEffect(() => {
    const cleanup = redraw();
    return cleanup ?? undefined;
  }, [redraw]);

  function addPerson() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    const updated: GraphData = {
      nodes: [...data.nodes, { id, name: trimmed }],
      links: data.links,
    };
    setData(updated);
    saveData(updated);
    setNewName("");
    setShowAddPerson(false);
  }

  function addLink() {
    if (!linkFrom || !linkTo || linkFrom === linkTo) return;
    const alreadyExists = data.links.some(
      (l) =>
        (l.source === linkFrom && l.target === linkTo) ||
        (l.source === linkTo && l.target === linkFrom)
    );
    if (alreadyExists) return;
    const updated: GraphData = {
      nodes: data.nodes,
      links: [...data.links, { source: linkFrom, target: linkTo }],
    };
    setData(updated);
    saveData(updated);
    setLinkFrom("");
    setLinkTo("");
    setShowAddLink(false);
  }

  function deleteSelected() {
    if (!selectedNode) return;
    const updated: GraphData = {
      nodes: data.nodes.filter((n) => n.id !== selectedNode),
      links: data.links.filter(
        (l) => l.source !== selectedNode && l.target !== selectedNode
      ),
    };
    setData(updated);
    saveData(updated);
    setSelectedNode(null);
  }

  const selectedPerson = data.nodes.find((n) => n.id === selectedNode);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <h1 className="text-xl font-bold text-indigo-400 tracking-wide">Sociogramma</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddPerson(true); setShowAddLink(false); }}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
          >
            + Persona
          </button>
          <button
            onClick={() => { setShowAddLink(true); setShowAddPerson(false); }}
            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm font-medium transition-colors"
          >
            + Connessione
          </button>
          {selectedNode && !data.nodes.find((n) => n.id === selectedNode)?.isMe && (
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-medium transition-colors"
            >
              Elimina
            </button>
          )}
        </div>
      </header>

      {selectedPerson && (
        <div className="px-6 py-2 bg-gray-800 border-b border-gray-700 text-sm text-gray-300">
          Selezionato: <span className="font-semibold text-white">{selectedPerson.name}</span>
          {selectedPerson.isMe && <span className="ml-2 text-indigo-400">(tu)</span>}
          <button onClick={() => setSelectedNode(null)} className="ml-4 text-gray-500 hover:text-gray-300">✕</button>
        </div>
      )}

      <div className="flex-1 relative">
        <svg ref={svgRef} className="w-full h-full" />
        <div className="absolute bottom-4 left-4 text-xs text-gray-600">
          {data.nodes.length} persone · {data.links.length} connessioni · trascina i nodi · scroll per zoom
        </div>
      </div>

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
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-indigo-500 outline-none text-sm mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddPerson(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">Annulla</button>
              <button onClick={addPerson} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Aggiungi</button>
            </div>
          </div>
        </div>
      )}

      {showAddLink && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Aggiungi connessione</h2>
            <select value={linkFrom} onChange={(e) => setLinkFrom(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 outline-none text-sm mb-3">
              <option value="">Da...</option>
              {data.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 outline-none text-sm mb-4">
              <option value="">A...</option>
              {data.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
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
