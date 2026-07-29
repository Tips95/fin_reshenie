import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        brand: {
          50: "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          300: "var(--brand-300)",
          400: "var(--brand-400)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
          800: "var(--brand-800)",
          900: "var(--brand-900)",
          950: "var(--brand-950)",
        },
        status: {
          success: {
            bg: "var(--status-success-bg)",
            border: "var(--status-success-border)",
            text: "var(--status-success-text)",
            solid: "var(--status-success-solid)",
          },
          warning: {
            bg: "var(--status-warning-bg)",
            border: "var(--status-warning-border)",
            text: "var(--status-warning-text)",
            solid: "var(--status-warning-solid)",
          },
          danger: {
            bg: "var(--status-danger-bg)",
            border: "var(--status-danger-border)",
            text: "var(--status-danger-text)",
            solid: "var(--status-danger-solid)",
          },
          neutral: {
            bg: "var(--status-neutral-bg)",
            border: "var(--status-neutral-border)",
            text: "var(--status-neutral-text)",
            solid: "var(--status-neutral-solid)",
          },
        },
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        hover: "var(--shadow-hover)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-xl)",
        "3xl": "var(--radius-xl)",
      },
      spacing: {
        "page-x": "var(--space-page-x)",
        "page-y": "var(--space-page-y)",
        card: "var(--space-card)",
        stack: "var(--space-stack)",
        section: "var(--space-section)",
        group: "var(--space-group)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
};
export default config;
