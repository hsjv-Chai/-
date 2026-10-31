"use client";
import { useId } from "react";
import { GROWTH_STAGES } from "@/lib/garden/model";

export function MelonPlant({
  stage,
  small = false,
}: {
  stage: number;
  small?: boolean;
}) {
  const clip = useId();
  return (
    <svg
      viewBox="0 0 360 280"
      className={"garden-plant" + (small ? " garden-plant-small" : "")}
      role="img"
      aria-label={
        stage ? `瓜苗${GROWTH_STAGES[stage]}阶段` : "等待播种的小瓜田"
      }
    >
      <circle cx="185" cy="132" r="114" fill="#eaf0d9" />
      <circle cx="281" cy="51" r="17" fill="#efd896" />
      <path
        d="M45 229Q174 205 313 231"
        fill="none"
        stroke="#a8b791"
        strokeWidth="2"
      />
      <ellipse cx="180" cy="235" rx="111" ry="12" fill="#dce4ce" />
      <path
        d="M112 224Q150 202 185 222T264 224"
        fill="none"
        stroke="#ae9472"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {stage <= 1 && (
        <>
          <path d="M171 218q-8-19 9-24q17 12 0 26" fill="#9d7953" />
          <path
            d="M155 190l-9-10m48 12l9-9"
            stroke="#b19c7d"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {stage > 1 && (
        <>
          <path
            d={
              stage < 3
                ? "M179 222Q169 193 184 167"
                : "M179 222Q154 165 187 115Q199 88 180 72"
            }
            fill="none"
            stroke="#50754b"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path d="M176 200Q132 200 132 170Q167 165 176 200" fill="#77975a" />
          <path d="M180 181Q178 147 214 151Q215 178 180 181" fill="#416d4b" />
          {stage >= 3 && (
            <>
              <path
                d="M182 137Q139 142 137 105Q173 99 182 137"
                fill="#77975a"
              />
              <path d="M191 113Q200 77 230 89Q224 122 191 113" fill="#507b4e" />
              <path
                d="M177 173Q235 179 245 214"
                fill="none"
                stroke="#50754b"
                strokeWidth="4"
              />
              <path
                d="M193 111q32 24 40 9t-9-12"
                fill="none"
                stroke="#729157"
                strokeWidth="2"
              />
            </>
          )}
          {stage === 4 && (
            <g transform="translate(181 70)" fill="#efc765">
              <ellipse cy="-10" rx="7" ry="12" />
              <ellipse cy="-10" rx="7" ry="12" transform="rotate(72)" />
              <ellipse cy="-10" rx="7" ry="12" transform="rotate(144)" />
              <ellipse cy="-10" rx="7" ry="12" transform="rotate(216)" />
              <ellipse cy="-10" rx="7" ry="12" transform="rotate(288)" />
              <circle r="6" fill="#a68036" />
            </g>
          )}
          {stage >= 5 && (
            <g
              transform={
                stage === 5
                  ? "translate(105 94) scale(.55)"
                  : stage === 6
                    ? "translate(47 42) scale(.8)"
                    : undefined
              }
            >
              <defs>
                <clipPath id={clip}>
                  <ellipse cx="245" cy="202" rx="53" ry="44" />
                </clipPath>
              </defs>
              <ellipse cx="245" cy="202" rx="53" ry="44" fill="#729250" />
              <g
                clipPath={`url(#${clip})`}
                fill="none"
                stroke="#3c6845"
                strokeWidth="9"
              >
                <path d="M224 156q-30 45 0 92M245 156q-14 45 0 92M265 156q26 45 0 92M286 164q28 40 0 78" />
              </g>
              <path
                d="M245 158q-7-16 7-21q9-3 9 4"
                fill="none"
                stroke="#50754b"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <ellipse
                cx="225"
                cy="184"
                rx="10"
                ry="5"
                fill="#e0e8bd"
                opacity=".45"
                transform="rotate(-30 225 184)"
              />
            </g>
          )}
        </>
      )}
      <path
        d="M76 134v12m-6-6h12M304 159v10m-5-5h10"
        stroke="#b4c29a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
