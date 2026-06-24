type Props = {
  points: number[];
  stroke?: string;
  width?: number;
  height?: number;
};

export function Sparkline({ points, stroke = "var(--ion)", width = 300, height = 60 }: Props) {
  if (points.length < 2) {
    // Render a flat baseline
    return (
      <svg width={width} height={height} aria-hidden>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={stroke}
          strokeWidth={1.5}
          strokeOpacity={0.35}
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = { x: 4, y: 6 };
  const innerW = width - pad.x * 2;
  const innerH = height - pad.y * 2;

  const coords = points.map((p, i) => ({
    x: pad.x + (i / (points.length - 1)) * innerW,
    y: pad.y + (1 - (p - min) / range) * innerH,
  }));

  const polyPoints = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");

  // Area fill: close the path at the bottom corners
  const areaPath = [
    `M ${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`,
    ...coords.slice(1).map((c) => `L ${c.x.toFixed(2)},${c.y.toFixed(2)}`),
    `L ${coords[coords.length - 1].x.toFixed(2)},${(height - pad.y).toFixed(2)}`,
    `L ${coords[0].x.toFixed(2)},${(height - pad.y).toFixed(2)}`,
    "Z",
  ].join(" ");

  const gradId = "spark-grad";
  const filterId = "spark-glow";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
        <filter id={filterId} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Line with glow */}
      <polyline
        points={polyPoints}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={`url(#${filterId})`}
      />
      {/* Endpoint dot */}
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r={3}
        fill={stroke}
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}
