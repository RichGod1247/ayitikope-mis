// src/app/district/director-feedback/review/DirectorFeedbackPetalChart.tsx

type PetalSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  averagePercentage: number | null;
  bandLabel: string;
};

export const DIRECTOR_FEEDBACK_PETAL_COUNT = 7;

const PETAL_COLORS = [
  "#57D6C4",
  "#E8C96A",
  "#8EA7FF",
  "#F29D72",
  "#C698E8",
  "#79B8F3",
  "#77D79B",
] as const;

function clampPercentage(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function point(cx: number, cy: number, radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function petalPath(args: {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
}) {
  const outerStart = point(
    args.cx,
    args.cy,
    args.outerRadius,
    args.startAngle,
  );
  const outerEnd = point(
    args.cx,
    args.cy,
    args.outerRadius,
    args.endAngle,
  );
  const innerEnd = point(
    args.cx,
    args.cy,
    args.innerRadius,
    args.endAngle,
  );
  const innerStart = point(
    args.cx,
    args.cy,
    args.innerRadius,
    args.startAngle,
  );
  const largeArc = args.endAngle - args.startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${args.outerRadius} ${args.outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${args.innerRadius} ${args.innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function formatPercentage(value: number | null) {
  return value == null || !Number.isFinite(value)
    ? "No data"
    : `${value.toFixed(1)}%`;
}

export default function DirectorFeedbackPetalChart(props: {
  overallPercentage: number | null;
  sections: PetalSection[];
}) {
  const sections = [...props.sections]
    .sort((left, right) => left.sectionOrder - right.sectionOrder)
    .slice(0, DIRECTOR_FEEDBACK_PETAL_COUNT);
  const cx = 210;
  const cy = 210;
  const innerRadius = 76;
  const minimumOuterRadius = 112;
  const maximumOuterRadius = 180;
  const sectorAngle = 360 / DIRECTOR_FEEDBACK_PETAL_COUNT;
  const gap = 4;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)] lg:items-center">
      <div className="mx-auto w-full max-w-[520px]">
        <svg
          viewBox="0 0 420 420"
          role="img"
          aria-labelledby="director-feedback-petal-title director-feedback-petal-description"
          className="h-auto w-full"
        >
          <title id="director-feedback-petal-title">
            Seven-section Director leadership feedback profile
          </title>
          <desc id="director-feedback-petal-description">
            Seven radial petals represent the official appraisal sections. A
            longer petal means a higher municipal aggregate percentage.
          </desc>

          <circle
            cx={cx}
            cy={cy}
            r={maximumOuterRadius + 8}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />

          {sections.map((section, index) => {
            const percentage = clampPercentage(section.averagePercentage);
            const outerRadius =
              minimumOuterRadius +
              ((maximumOuterRadius - minimumOuterRadius) * percentage) / 100;
            const startAngle = index * sectorAngle + gap / 2;
            const endAngle = (index + 1) * sectorAngle - gap / 2;
            const labelPoint = point(
              cx,
              cy,
              Math.max(innerRadius + 24, outerRadius - 25),
              (startAngle + endAngle) / 2,
            );

            return (
              <g key={section.sectionKey}>
                <path
                  d={petalPath({
                    cx,
                    cy,
                    innerRadius,
                    outerRadius,
                    startAngle,
                    endAngle,
                  })}
                  fill={PETAL_COLORS[index] ?? "#57D6C4"}
                  fillOpacity="0.9"
                  stroke="rgba(6,16,31,0.9)"
                  strokeWidth="2"
                />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#06101F"
                  fontSize="18"
                  fontWeight="800"
                >
                  {section.sectionOrder}
                </text>
              </g>
            );
          })}

          <circle
            cx={cx}
            cy={cy}
            r={innerRadius - 5}
            fill="#0A1628"
            stroke="rgba(232,201,106,0.55)"
            strokeWidth="3"
          />
          <text
            x={cx}
            y={cy - 12}
            textAnchor="middle"
            fill="#8F98A8"
            fontSize="12"
            fontWeight="700"
            letterSpacing="1.5"
          >
            OVERALL
          </text>
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            fill="#F7F4ED"
            fontSize="30"
            fontWeight="800"
          >
            {props.overallPercentage == null
              ? "—"
              : `${props.overallPercentage.toFixed(1)}%`}
          </text>
        </svg>
      </div>

      <div className="space-y-2" aria-label="Text alternative for the chart">
        {sections.map((section, index) => (
          <div
            key={section.sectionKey}
            className="rounded-2xl border border-white/10 bg-[#0A1628] p-3"
          >
            <div className="flex items-start gap-3">
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-[#06101F]"
                style={{ backgroundColor: PETAL_COLORS[index] ?? "#57D6C4" }}
              >
                {section.sectionOrder}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold leading-5 text-[#F7F4ED]">
                  {section.sectionTitle}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#C9CDD6]">
                  <span>{formatPercentage(section.averagePercentage)}</span>
                  <span>{section.bandLabel}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${clampPercentage(section.averagePercentage)}%`,
                      backgroundColor: PETAL_COLORS[index] ?? "#57D6C4",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
