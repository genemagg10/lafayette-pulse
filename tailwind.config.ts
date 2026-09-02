import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
        },
        stance: {
          support: "var(--stance-support)",
          oppose: "var(--stance-oppose)",
          endorse: "var(--stance-endorse)",
        },
        org: {
          "city-body": "var(--org-city-body)",
          civic: "var(--org-civic)",
          interest: "var(--org-interest)",
          campaign: "var(--org-campaign)",
          foundation: "var(--org-foundation)",
          other: "var(--org-other)",
        },
        forest: {
          DEFAULT: "var(--forest)",
          soft: "var(--forest-soft)",
          50: "var(--canvas)",
          100: "var(--cream-100)",
          200: "var(--line)",
          300: "var(--line-strong)",
          400: "var(--ink-faint)",
          500: "var(--ink-muted)",
          600: "var(--accent)",
          700: "var(--forest-700)",
          800: "var(--forest)",
          900: "var(--ink)",
          950: "#121814",
        },
        cream: {
          50: "var(--canvas)",
          100: "var(--cream-100)",
          200: "var(--line)",
          300: "var(--line-strong)",
        },
      },
      fontFamily: {
        heading: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
        body: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
      },
      fontSize: {
        kpi: ["1.5rem", { lineHeight: "1.2", fontWeight: "700" }],
        nav: ["0.875rem", { lineHeight: "1.25" }],
        section: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        pill: "var(--r-pill)",
      },
      boxShadow: {
        lg: "none",
        "2xl": "none",
        sheet: "var(--shadow-sheet)",
      },
      spacing: {
        chrome: "var(--chrome-h)",
        master: "300px",
        detail: "340px",
        "map-panel": "340px",
      },
      minHeight: {
        viz: "420px",
      },
      width: {
        master: "300px",
        detail: "340px",
        "map-panel": "340px",
      },
    },
  },
  plugins: [],
};
export default config;
