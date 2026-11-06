export interface PartDescription { id: string; description: string; parent?: string }
export interface Subject { name: string; parts: PartDescription[] }
export interface MorphPlan {
  id: string;
  title: string;
  duration: number;
  source: Subject;
  target: Subject;
  candidates: { name: string; approach: string; tradeoff: string }[];
  selected: string;
  mappings: { from: string[]; to: string[]; carry: string }[];
  beats: { at: number; event: string; effects: string[] }[];
  constraints: string[];
  risks: { failure: string; fallback: string }[];
}

export function orderParts<T extends { id: string; parent?: string }>(parts: readonly T[]): T[] {
  const byId = new Map(parts.map(part => [part.id, part]));
  if (byId.size !== parts.length || parts.some(part => !part.id.trim())) {
    throw new Error("Part IDs must be unique and nonempty.");
  }
  const ordered: T[] = [];
  const entered = new Set<string>();
  const done = new Set<string>();
  function visit(part: T) {
    if (done.has(part.id)) return;
    if (entered.has(part.id)) throw new Error("Cyclic part hierarchy at " + part.id);
    entered.add(part.id);
    if (part.parent) {
      const parent = byId.get(part.parent);
      if (!parent) throw new Error("Missing parent " + part.parent);
      visit(parent);
    }
    done.add(part.id);
    ordered.push(part);
  }
  parts.forEach(visit);
  return ordered;
}

export function validatePlan(plan: MorphPlan): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plan.id) || !plan.title.trim() ||
      !Number.isFinite(plan.duration) || plan.duration <= 0) throw new Error("Invalid plan identity or duration.");
  const candidateNames = new Set(plan.candidates.map(candidate => candidate.name));
  if (candidateNames.size < 3 || candidateNames.size !== plan.candidates.length ||
      !candidateNames.has(plan.selected)) throw new Error("Compare three distinct candidates and select one by name.");
  const from = new Set(orderParts(plan.source.parts).map(part => part.id));
  const to = new Set(orderParts(plan.target.parts).map(part => part.id));
  if (!from.size || !to.size || !plan.mappings.length) throw new Error("A plan needs both subjects and a mapping.");
  for (const link of plan.mappings) {
    if (!link.from.length || !link.to.length || !link.carry.trim() ||
        link.from.some(id => !from.has(id)) || link.to.some(id => !to.has(id))) {
      throw new Error("Invalid semantic mapping: " + link.from.join(",") + " → " + link.to.join(","));
    }
  }
  if (plan.beats[0]?.at !== 0 || plan.beats.at(-1)?.at !== plan.duration ||
      plan.beats.some((beat, i) => !beat.event.trim() || !beat.effects.length || !Number.isFinite(beat.at) ||
        (i > 0 && beat.at <= plan.beats[i - 1].at))) {
    throw new Error("Use strictly ordered beats from time zero through the stated duration.");
  }
  if (!plan.constraints.length || !plan.risks.length) throw new Error("Record continuity constraints and fallback plans.");
}
