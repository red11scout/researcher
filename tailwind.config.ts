// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BlueAlly Official Brand Colors - Full Palette
        blueally: {
          // Primary Colors
          navy: "#0339AF",      // Primary (Strength & Maturity)
          royal: "#4C73E9",     // Secondary (Insight & Clarity)
          cyan: "#00B4D8",      // Accent (Highlights, Interactive)
          // Secondary Colors
          green: "#7A8B51",     // Growth/Success
          lightgreen: "#A3C585", // Positive gradients
          orange: "#D97706",    // Warnings, Risk emphasis
          softblue: "#E0F2FE",  // Callout backgrounds
          // Neutrals
          dark: "#0a192f",      // Executive Dark Background
          light: "#f8faff",     // Clean Report Background
          cream: "#FEFCF3",     // Warm white alternative
          slate: "#1E293B",     // Dark text
          gray: "#64748B",      // Secondary text
          border: "#E2E8F0",    // Subtle borders
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
        background: "#f8faff",
        // Chart-specific colors
        chart: {
          revenue: "#059669",   // Green for revenue growth
          cost: "#0339AF",      // Navy for cost reduction
          cashflow: "#4C73E9",  // Royal for cash flow
          risk: "#D97706",      // Orange for risk
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ["Montserrat", "system-ui", "sans-serif"],
        display: ["Montserrat", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Executive typography scale
        "display-xl": ["4rem", { lineHeight: "1.1", fontWeight: "800" }],
        "display-lg": ["3rem", { lineHeight: "1.15", fontWeight: "700" }],
        "display-md": ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
        "heading-lg": ["1.875rem", { lineHeight: "1.25", fontWeight: "600" }],
        "heading-md": ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
        "heading-sm": ["1.25rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body-md": ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        // Executive elevation system
        "card": "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
        "card-hover": "0 10px 25px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04)",
        "stat": "0 4px 14px rgba(3, 57, 175, 0.12)",
        "glow": "0 0 20px rgba(76, 115, 233, 0.25)",
      },
      backgroundImage: {
        // Executive gradients
        "gradient-navy": "linear-gradient(135deg, #0339AF 0%, #4C73E9 100%)",
        "gradient-success": "linear-gradient(135deg, #7A8B51 0%, #A3C585 100%)",
        "gradient-light": "linear-gradient(180deg, #ffffff 0%, #f8faff 100%)",
        "gradient-dark": "linear-gradient(135deg, #0a192f 0%, #1a365d 100%)",
        "gradient-stat": "linear-gradient(135deg, #f8faff 0%, #E0F2FE 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "count-up": "countUp 2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
