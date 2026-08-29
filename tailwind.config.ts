import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e5ff",
          200: "#bcd1ff",
          300: "#8eb3ff",
          400: "#598aff",
          500: "#3363f7",
          600: "#1f45ec",
          700: "#1a35d8",
          800: "#1c2ead",
          900: "#1d2d88",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
