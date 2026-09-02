import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        ink: "var(--color-ink)",
        accent: "var(--color-accent)",
        line: "var(--color-line)",
        forest: {
          50: "#F7F6F2",
          100: "#EEEBE3",
          200: "#E3E0D7",
          300: "#C5C1B5",
          400: "#8A948C",
          500: "#5A7366",
          600: "#3D6B5A",
          700: "#3D6B5A",
          800: "#24352A",
          900: "#1A2420",
          950: "#121814",
        },
        cream: {
          50: "#F7F6F2",
          100: "#F3F1EB",
          200: "#E3E0D7",
          300: "#D6D2C6",
        },
      },
      fontFamily: {
        heading: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
        body: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
      },
      boxShadow: {
        lg: "none",
        "2xl": "none",
      },
    },
  },
  plugins: [],
};
export default config;
