import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f7ff",
          100: "#e0ecff",
          200: "#c2d9ff",
          300: "#94bcff",
          400: "#5f94ff",
          500: "#3a6df0",
          600: "#284fd0",
          700: "#213fa8",
          800: "#1f3785",
          900: "#1e326c",
          950: "#141d40",
        },
        malta: {
          red: "#cf142b",
        },
      },
      boxShadow: {
        card: "0 10px 40px -12px rgba(20, 29, 64, 0.25)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in .4s ease-out",
        "slide-up": "slide-up .4s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
