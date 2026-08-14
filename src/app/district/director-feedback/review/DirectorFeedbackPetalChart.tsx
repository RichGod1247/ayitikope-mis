"use client";

type PetalSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  averagePercentage: number | null;
  bandLabel: string;
};

export const DIRECTOR_FEEDBACK_PETAL_COUNT = 7;

const PETAL_PALETTE = [
  { start: "#83E9D9", end: "#2CB6A7", solid: "#57D6C4" },
  { start: "#FFE48B", end: "#D6A92D", solid: "#E8C96A" },
  { start: "#AFC0FF", end: "#6F84E8", solid: "#8EA7FF" },
  { start: "#FFC09E", end: "#E2774B", solid: "#F29D72" },
  { start: "#DFB7F4", end: "#9C6DCA", solid: "#C698E8" },
  { start: "#A6D6FF", end: "#4F97D7", solid: "#79B8F3" },
  { start: "#A4E9BA", end: "#4DBB73", solid: "#77D79B" },
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
    : `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export default function DirectorFeedbackPetalChart(props: {
  overallPercentage: number | null;
  sections: PetalSection[];
  selectedSectionKey?: string | null;
  onSelectSection?: (sectionKey: string) => void;
}) {
  const sections = [...props.sections]
    .sort((left, right) => left.sectionOrder - right.sectionOrder)
    .slice(0, DIRECTOR_FEEDBACK_PETAL_COUNT);
  const cx = 260;
  const cy = 260;
  const innerRadius = 98;
  const minimumOuterRadius = 158;
  const maximumOuterRadius = 220;
  const sectorAngle = 360 / DIRECTOR_FEEDBACK_PETAL_COUNT;
  const gap = 3.4;
  const interactive = typeof props.onSelectSection === "function";

  function selectSection(sectionKey: string) {
    props.onSelectSection?.(sectionKey);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] xl:items-center">
      <div className="mx-auto w-full max-w-[620px]">
        <svg
          viewBox="0 0 520 520"
          role="img"
          aria-labelledby="director-feedback-petal-title director-feedback-petal-description"
          className="h-auto w-full overflow-visible"
        >
          <title id="director-feedback-petal-title">
            Interactive seven-section Director leadership feedback profile
          </title>
          <desc id="director-feedback-petal-description">
            Seven EduLife OS wedges represent the official appraisal sections.
            A longer wedge means a higher municipal aggregate percentage. Select
            a wedge to open its questionnaire-level aggregate breakdown.
          </desc>

          <defs>
            {PETAL_PALETTE.map((palette, index) => (
              <linearGradient
                key={`gradient-${index}`}
                id={`director-petal-gradient-${index}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={palette.start} />
                <stop offset="100%" stopColor={palette.end} />
              </linearGradient>
            ))}
            <radialGradient id="director-petal-hub" cx="42%" cy="35%" r="72%">
              <stop offset="0%" stopColor="#18345A" />
              <stop offset="58%" stopColor="#0A1628" />
              <stop offset="100%" stopColor="#06101F" />
            </radialGradient>
            <filter
              id="director-petal-shadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feDropShadow
                dx="0"
                dy="9"
                stdDeviation="8"
                floodColor="#020812"
                floodOpacity="0.55"
              />
            </filter>
            <filter
              id="director-petal-selected"
              x="-35%"
              y="-35%"
              width="170%"
              height="170%"
            >
              <feDropShadow
                dx="0"
                dy="12"
                stdDeviation="10"
                floodColor="#020812"
                floodOpacity="0.7"
              />
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="5"
                floodColor="#F7F4ED"
                floodOpacity="0.28"
              />
            </filter>
          </defs>

          <circle
            cx={cx}
            cy={cy}
            r={maximumOuterRadius + 20}
            fill="#081426"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
          <circle
            cx={cx}
            cy={cy}
            r={maximumOuterRadius + 2}
            fill="none"
            stroke="rgba(232,201,106,0.12)"
            strokeWidth="1"
            strokeDasharray="4 7"
          />

          {sections.map((section, index) => {
            const percentage = clampPercentage(section.averagePercentage);
            const selected = props.selectedSectionKey === section.sectionKey;
            const outerRadius =
              minimumOuterRadius +
              ((maximumOuterRadius - minimumOuterRadius) * percentage) / 100 +
              (selected ? 10 : 0);
            const startAngle = index * sectorAngle + gap / 2;
            const endAngle = (index + 1) * sectorAngle - gap / 2;
            const middleAngle = (startAngle + endAngle) / 2;
            const labelPoint = point(
              cx,
              cy,
              Math.max(innerRadius + 46, outerRadius - 38),
              middleAngle,
            );
            return (
              <g
                key={section.sectionKey}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? selected : undefined}
                aria-label={
                  interactive
                    ? `Section ${section.sectionOrder}: ${section.sectionTitle}, ${formatPercentage(section.averagePercentage)}. Select for question breakdown.`
                    : undefined
                }
                onClick={() => selectSection(section.sectionKey)}
                onKeyDown={(event) => {
                  if (!interactive) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectSection(section.sectionKey);
                  }
                }}
                className={interactive ? "cursor-pointer outline-none" : undefined}
              >
                <path
                  d={petalPath({
                    cx,
                    cy,
                    innerRadius,
                    outerRadius,
                    startAngle,
                    endAngle,
                  })}
                  fill={`url(#director-petal-gradient-${index})`}
                  fillOpacity={selected ? 1 : 0.96}
                  stroke={selected ? "#F7F4ED" : "#06101F"}
                  strokeWidth={selected ? 4 : 3}
                  filter={
                    selected
                      ? "url(#director-petal-selected)"
                      : "url(#director-petal-shadow)"
                  }
                  style={{
                    transition:
                      "fill-opacity 160ms ease, stroke-width 160ms ease, filter 160ms ease",
                  }}
                />

                <circle
                  cx={labelPoint.x}
                  cy={labelPoint.y - 12}
                  r={20}
                  fill="rgba(247,244,237,0.9)"
                  stroke="rgba(6,16,31,0.18)"
                  strokeWidth="1"
                />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y - 11}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#06101F"
                  fontSize="17"
                  fontWeight="900"
                >
                  {section.sectionOrder}
                </text>
                <text
                  x={labelPoint.x}
                  y={labelPoint.y + 24}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#06101F"
                  fontSize="15"
                  fontWeight="900"
                >
                  {section.averagePercentage == null
                    ? "—"
                    : `${Math.round(
                        Math.max(0, Math.min(100, section.averagePercentage)),
                      )}%`}
                </text>
              </g>
            );
          })}

          <circle
            cx={cx}
            cy={cy}
            r={innerRadius + 13}
            fill="#071426"
            stroke="rgba(232,201,106,0.26)"
            strokeWidth="8"
          />
          <circle
            cx={cx}
            cy={cy}
            r={innerRadius + 3}
            fill="url(#director-petal-hub)"
            stroke="#E8C96A"
            strokeOpacity="0.72"
            strokeWidth="3"
            filter="url(#director-petal-shadow)"
          />
          <text
            x={cx}
            y={cy - 28}
            textAnchor="middle"
            fill="#8F98A8"
            fontSize="12"
            fontWeight="800"
            letterSpacing="1.8"
          >
            EDULIFE OS
          </text>
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="#F7F4ED"
            fontSize="15"
            fontWeight="800"
          >
            LEADERSHIP PROFILE
          </text>
          <text
            x={cx}
            y={cy + 35}
            textAnchor="middle"
            fill="#F7F4ED"
            fontSize="38"
            fontWeight="900"
          >
            {props.overallPercentage == null
              ? "—"
              : `${Math.round(
                  Math.max(0, Math.min(100, props.overallPercentage)),
                )}%`}
          </text>
          <text
            x={cx}
            y={cy + 58}
            textAnchor="middle"
            fill="#9FA8B7"
            fontSize="11"
            fontWeight="700"
          >
            MUNICIPAL AGGREGATE
          </text>
        </svg>
      </div>

      <div className="space-y-2" aria-label="Text alternative and section controls">
        {sections.map((section, index) => {
          const selected = props.selectedSectionKey === section.sectionKey;
          const palette = PETAL_PALETTE[index] ?? PETAL_PALETTE[0];

          return (
            <button
              key={section.sectionKey}
              type="button"
              aria-pressed={interactive ? selected : undefined}
              disabled={!interactive}
              onClick={() => selectSection(section.sectionKey)}
              className={`w-full rounded-2xl border p-3 text-left transition disabled:cursor-default ${
                selected
                  ? "border-[#E8C96A]/55 bg-[#10213A] shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
                  : "border-white/10 bg-[#0A1628] hover:border-white/20 hover:bg-[#0D1B31]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-[#06101F] shadow-sm"
                  style={{ backgroundColor: palette.solid }}
                >
                  {section.sectionOrder}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-5 text-[#F7F4ED]">
                    {section.sectionTitle}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#C9CDD6]">
                    <span className="font-bold text-[#F7F4ED]">
                      {formatPercentage(section.averagePercentage)}
                    </span>
                    <span>{section.bandLabel}</span>
                    {selected ? (
                      <span className="font-bold text-[#E8C96A]">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${clampPercentage(section.averagePercentage)}%`,
                        background: `linear-gradient(90deg, ${palette.start}, ${palette.end})`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {interactive ? (
          <div className="rounded-2xl border border-[#57D6C4]/20 bg-[#57D6C4]/8 px-4 py-3 text-xs leading-5 text-cyan-50">
            Tap a petal or section card to inspect the aggregate questionnaire
            scores behind that section result.
          </div>
        ) : null}
      </div>
    </div>
  );
}
