// tailwind.config.ts
import { type Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BlueAlly Official Brand Colors
        blueally: {
          navy: "#0339AF",    // Primary (Strength & Maturity)
          royal: "#4C73E9",   // Secondary (Insight & Clarity)
          green: "#7A8B51",   // Accent (Growth / Flywheel)
          dark: "#0a192f",    // Executive Dark Background
          light: "#f8faff",   // Clean Report Background
        },
        // Map to semantic names for ease of use
        primary: {
          DEFAULT: "#0339AF",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#4C73E9",
          foreground: "#ffffff",
        },
        accent: {
          DEFAULT: "#7A8B51",
          foreground: "#ffffff",
        },
        background: "#f8faff", // Very light blue-grey for paper feel
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"], // Clean, executive font
        heading: ["Montserrat", "sans-serif"], // Strong headers
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
