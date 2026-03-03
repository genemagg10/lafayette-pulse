import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#f3f6f3",
          100: "#e2e8e2",
          200: "#c5d1c6",
          300: "#a0b5a1",
          400: "#789a7a",
          500: "#567a58",
          600: "#426244",
          700: "#364f37",
          800: "#2C3E2D",
          900: "#243324",
          950: "#141d15",
        },
        cream: {
          50: "#FAFAF7",
          100: "#F5F5F0",
          200: "#EBEBDF",
          300: "#DDDDD0",
        },
      },
      fontFamily: {
        heading: ["Fraunces", "serif"],
        body: ["DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
