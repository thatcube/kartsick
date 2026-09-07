import React from "react";
import { isLayoutQuery } from "@kartsick/content";
import type { CourseQuery, RoadPoint } from "@kartsick/content";
import type { RaceState } from "@kartsick/simulation";

export function mapGeometry(course: CourseQuery) {
  const minX = Math.min(...course.road.map(point => point.x));
  const maxX = Math.max(...course.road.map(point => point.x));
  const minZ = Math.min(...course.road.map(point => point.z));
  const maxZ = Math.max(...course.road.map(point => point.z));
  const scale = 190 / Math.max(1, maxX - minX, maxZ - minZ);
  const x = (value: number) => 110 + (value - (minX + maxX) / 2) * scale;
  const y = (value: number) => 110 - (value - (minZ + maxZ) / 2) * scale;
  const line = (points: readonly RoadPoint[]) => points.filter((_, index) => index % 3 === 0 || index === points.length - 1)
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.x).toFixed(1)},${y(point.z).toFixed(1)}`).join(" ");
  const path = line(course.road) + (course.format === "laps" ? " Z" : "");
  const shortcuts = isLayoutQuery(course) ? course.routes.filter(route => route.id !== "main").map(route => line(route.points)) : [];
  const gates = [0, ...course.sectors, ...(course.format === "sectors" ? [1] : [])].map(u => {
    const point = course.sampleRoad(u);
    return { x: x(point.x), y: y(point.z), finish: u === 1 };
  });
  return { x, y, path, shortcuts, gates };
}
export type MapGeometry = ReturnType<typeof mapGeometry>;
export function RaceMiniMap({ geometry, racers, own }: { geometry: MapGeometry; racers: RaceState["karts"]; own: ReadonlySet<string> }): React.JSX.Element {
  return <svg viewBox="0 0 220 220" className="race-map" role="img" aria-label="Course map and kart positions">
    <path d={geometry.path} fill="none" stroke="#24345b" strokeWidth="10" strokeLinejoin="round" />
    <path d={geometry.path} fill="none" stroke="#fff0c9" strokeWidth="5" strokeLinejoin="round" />
    {geometry.shortcuts.map((path, index) => <path key={index} d={path} fill="none" stroke="#ffd46b" strokeWidth="3" strokeDasharray="3 2" />)}
    {geometry.gates.map((gate, index) => <rect key={index} x={gate.x - 3} y={gate.y - 3} width="6" height="6" fill={gate.finish ? "#ef927f" : "#fff0c9"} stroke="#24345b" strokeWidth="1">
      <title>{gate.finish ? "Finish" : index === 0 ? "Start" : `Sector ${index + 1}`}</title>
    </rect>)}
    {racers.map((kart, index) => <g key={kart.id} data-race-dot={kart.id} transform={`translate(${geometry.x(kart.state.x)},${geometry.y(kart.state.z)})`}>
      <circle r={own.has(kart.id) ? 8 : 6.5} fill={own.has(kart.id) ? "#ffd46b" : "#5bd1c4"} stroke="#24345b" strokeWidth={own.has(kart.id) ? 2.5 : 1.5} />
      <text x="0" y="3.5" textAnchor="middle" fill="#24345b" fontSize="10" fontWeight="700">{index + 1}</text>
      <title>{kart.name}</title>
    </g>)}
  </svg>;
}
export function updateRaceMap(root: HTMLElement, geometry: MapGeometry, race: RaceState): void {
  for (const node of root.querySelectorAll<SVGGElement>("[data-race-dot]")) {
    const kart = race.karts.find(kart => kart.id === node.dataset.raceDot);
    if (kart) node.setAttribute("transform", `translate(${geometry.x(kart.state.x).toFixed(1)},${geometry.y(kart.state.z).toFixed(1)})`);
  }
}
