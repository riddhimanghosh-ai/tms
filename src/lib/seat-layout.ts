/**
 * Seat geometry, shared by three places that must agree exactly: the generator
 * that writes seat rows, the organiser's editor, and the buyer's picker.
 *
 * Everything is produced in a fixed 1000×1000 viewBox so callers can scale the
 * map to any width without recomputing positions.
 */

export type ZoneShape = "grid" | "rings" | "arc";

export const SHAPES: {
  value: ZoneShape;
  title: string;
  body: string;
  bestFor: string;
}[] = [
  {
    value: "grid",
    title: "Rows & blocks",
    body: "Straight rows of numbered seats, A1 upwards.",
    bestFor: "Auditoriums, halls, stands",
  },
  {
    value: "rings",
    title: "Concentric rings",
    body: "Circles inside circles around a centre. Add as many layers as you need.",
    bestFor: "Garba grounds, akhada, in-the-round",
  },
  {
    value: "arc",
    title: "Curved arc",
    body: "Layers that fan around a stage instead of closing into a full circle.",
    bestFor: "Amphitheatres, open-air stages",
  },
];

export const VIEW = 1000;
export const CENTRE = VIEW / 2;
const OUTER_R = 468;

export type RingConfig = {
  shape: ZoneShape;
  ringCount: number;
  ringStartSeats: number;
  ringSeatStep: number;
  arcSpanDeg: number;
  arcStartDeg: number;
  innerHolePct: number;
};

/** Seats per layer, innermost first. Layers grow outwards. */
export function ringSizes(cfg: RingConfig): number[] {
  const count = Math.max(0, Math.min(40, cfg.ringCount));
  const start = Math.max(1, cfg.ringStartSeats);
  const step = Math.max(0, cfg.ringSeatStep);
  return Array.from({ length: count }, (_, i) => start + step * i);
}

export function ringTotalSeats(cfg: RingConfig) {
  return ringSizes(cfg).reduce((n, s) => n + s, 0);
}

export type SeatPoint = { x: number; y: number; angleDeg: number; r: number };

/**
 * Coordinates are rounded before they reach the DOM.
 *
 * Math.cos and Math.sin are not required to be correctly rounded, and Node and
 * the browser disagree in the last bit — enough to render cx="690.3527489594744"
 * on the server and 690.3527489594745 on the client, which React reports as a
 * hydration mismatch. Two decimals in a 1000-unit viewBox is far below a pixel.
 */
const px = (n: number) => Math.round(n * 100) / 100;

/**
 * Where one ring seat sits. A full 360° sweep spaces seats evenly with no
 * duplicate at the seam; a partial arc includes both endpoints.
 */
export function ringSeatPoint(
  cfg: RingConfig,
  ringIndex: number,
  posInRing: number,
  ringSize: number,
): SeatPoint {
  const rings = Math.max(1, Math.min(40, cfg.ringCount));
  const hole = Math.min(90, Math.max(0, cfg.innerHolePct)) / 100;
  const innerR = OUTER_R * hole;
  const radius =
    rings === 1 ? (innerR + OUTER_R) / 2 : innerR + ((OUTER_R - innerR) * ringIndex) / (rings - 1);

  const span = Math.max(10, Math.min(360, cfg.arcSpanDeg));
  const full = span >= 360;
  const angleDeg = full
    ? cfg.arcStartDeg + (360 * posInRing) / Math.max(1, ringSize)
    : ringSize > 1
      ? cfg.arcStartDeg + (span * posInRing) / (ringSize - 1)
      : cfg.arcStartDeg + span / 2;

  // −90° so 0° points up, which is where a stage or centre marker reads best.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: px(CENTRE + radius * Math.cos(rad)),
    y: px(CENTRE + radius * Math.sin(rad)),
    angleDeg,
    r: px(seatRadius(cfg, radius, ringSize)),
  };
}

/** Seat dots shrink as a layer gets crowded, so they never overlap. */
function seatRadius(cfg: RingConfig, radius: number, ringSize: number) {
  const span = Math.max(10, Math.min(360, cfg.arcSpanDeg));
  const arcLength = (2 * Math.PI * radius * span) / 360;
  const perSeat = arcLength / Math.max(1, ringSize);
  const rings = Math.max(1, cfg.ringCount);
  const hole = Math.min(90, Math.max(0, cfg.innerHolePct)) / 100;
  const bandGap = rings > 1 ? (OUTER_R * (1 - hole)) / (rings - 1) : OUTER_R;
  return Math.max(3.5, Math.min(16, perSeat * 0.38, bandGap * 0.36));
}

/** Human label for a ring seat: R1-07, R2-14. */
export function ringSeatLabel(ringIndex: number, posInRing: number) {
  return `R${ringIndex + 1}-${String(posInRing + 1).padStart(2, "0")}`;
}

export function ringRowLabel(ringIndex: number) {
  return `R${ringIndex + 1}`;
}

/** Grid seats mapped into the same viewBox so one renderer handles both. */
export function gridSeatPoint(rows: number, cols: number, row: number, col: number): SeatPoint {
  const pad = 40;
  const usableW = VIEW - pad * 2;
  const usableH = VIEW - pad * 2;
  const stepX = cols > 1 ? usableW / (cols - 1) : 0;
  const stepY = rows > 1 ? usableH / (rows - 1) : 0;
  const size = Math.max(6, Math.min(22, usableW / Math.max(cols, 1) / 2.4, usableH / Math.max(rows, 1) / 2.4));
  return {
    x: px(pad + (cols > 1 ? col * stepX : usableW / 2)),
    y: px(pad + (rows > 1 ? row * stepY : usableH / 2)),
    angleDeg: 0,
    r: px(size),
  };
}

export function zoneSeatTotal(cfg: RingConfig & { rows: number; cols: number }) {
  return cfg.shape === "grid" ? cfg.rows * cfg.cols : ringTotalSeats(cfg);
}


/* ------------------------------------------------------------------ stage */

export type StagePosition = "auto" | "top" | "bottom" | "left" | "right" | "centre";
export type StageShape = "auto" | "bar" | "curve" | "circle" | "none";

export type StageConfig = {
  label: string;
  position: StagePosition;
  shape: StageShape;
};

export const STAGE_POSITIONS: { value: StagePosition; label: string }[] = [
  { value: "auto", label: "Match the layout" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "centre", label: "Centre" },
];

export const STAGE_SHAPES: { value: StageShape; label: string }[] = [
  { value: "auto", label: "Match the layout" },
  { value: "bar", label: "Straight bar" },
  { value: "curve", label: "Curved screen" },
  { value: "circle", label: "Centre circle" },
  { value: "none", label: "Hide it" },
];

export const STAGE_LABEL_PRESETS = ["STAGE", "SCREEN", "DHOL", "CENTRE", "ALTAR", "PITCH"];

/**
 * Resolves "auto" into something sensible for the shape: rings play to the
 * middle, arcs and grids play to a stage the audience faces.
 */
export function resolveStage(stage: StageConfig, shape: ZoneShape) {
  const position: Exclude<StagePosition, "auto"> =
    stage.position !== "auto"
      ? stage.position
      : shape === "rings"
        ? "centre"
        : shape === "arc"
          ? "centre"
          : "top";

  const resolvedShape: Exclude<StageShape, "auto"> =
    stage.shape !== "auto"
      ? stage.shape
      : position === "centre"
        ? "circle"
        : shape === "grid"
          ? "bar"
          : "curve";

  return { label: stage.label || "STAGE", position, shape: resolvedShape };
}

export type StageGeometry = {
  kind: "circle" | "bar" | "curve";
  /** circle */
  cx: number;
  cy: number;
  r: number;
  /** bar */
  x: number;
  y: number;
  width: number;
  height: number;
  /** curve */
  path: string;
  /** where the label sits */
  labelX: number;
  labelY: number;
  rotate: number;
};

/** Pixel geometry for the stage marker inside the 1000×1000 viewBox. */
export function stageGeometry(
  resolved: ReturnType<typeof resolveStage>,
  innerRadius: number,
): StageGeometry | null {
  if (resolved.shape === "none") return null;

  const base: StageGeometry = {
    kind: "bar",
    cx: CENTRE,
    cy: CENTRE,
    r: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    path: "",
    labelX: CENTRE,
    labelY: CENTRE,
    rotate: 0,
  };

  if (resolved.position === "centre" || resolved.shape === "circle") {
    const r = Math.max(30, Math.min(150, innerRadius * 0.66));
    return { ...base, kind: "circle", cx: CENTRE, cy: CENTRE, r, labelX: CENTRE, labelY: CENTRE + 8 };
  }

  const thickness = 34;
  const length = VIEW * 0.56;
  const inset = 6;

  const layouts = {
    top: { x: (VIEW - length) / 2, y: inset, width: length, height: thickness, rotate: 0 },
    bottom: {
      x: (VIEW - length) / 2,
      y: VIEW - inset - thickness,
      width: length,
      height: thickness,
      rotate: 0,
    },
    left: { x: inset, y: (VIEW - length) / 2, width: thickness, height: length, rotate: -90 },
    right: {
      x: VIEW - inset - thickness,
      y: (VIEW - length) / 2,
      width: thickness,
      height: length,
      rotate: 90,
    },
  } as const;

  const l = layouts[resolved.position as keyof typeof layouts];
  const labelX = l.x + l.width / 2;
  const labelY = l.y + l.height / 2 + 7;

  if (resolved.shape === "curve") {
    const bow = 26;
    const path =
      resolved.position === "top"
        ? `M${l.x},${l.y + l.height} Q${CENTRE},${l.y - bow} ${l.x + l.width},${l.y + l.height}`
        : resolved.position === "bottom"
          ? `M${l.x},${l.y} Q${CENTRE},${l.y + l.height + bow} ${l.x + l.width},${l.y}`
          : resolved.position === "left"
            ? `M${l.x + l.width},${l.y} Q${l.x - bow},${CENTRE} ${l.x + l.width},${l.y + l.height}`
            : `M${l.x},${l.y} Q${l.x + l.width + bow},${CENTRE} ${l.x},${l.y + l.height}`;
    return { ...base, kind: "curve", ...l, path, labelX, labelY };
  }

  return { ...base, kind: "bar", ...l, labelX, labelY };
}

/** Per-layer colours/notes are stored as JSON; read them back defensively. */
export function parseLayerList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => (typeof v === "string" ? v : "")) : [];
  } catch {
    return [];
  }
}

export function layerColor(layerColors: string[], fallback: string, index: number) {
  return layerColors[index] || fallback;
}
