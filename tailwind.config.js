/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {colors: {
        // Brand palette — tweak any hex later if you prefer
        primary: {
          DEFAULT: "#166534",      // Forest Green (brand)
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F59E0B",      // Golden accent
          foreground: "#0B0F19",
        },
        accent: {
          DEFAULT: "#0EA5E9",      // Sky accent (links, highlights)
          foreground: "#042132",
        },

        // UI surface colors (light mode)
        background: "#FFFFFF",
        foreground: "#0B0F19",
        muted: "#F2F4F7",
        border:  "#E5E7EB",
        card:    "#FFFFFF",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        soft: "0 6px 24px rgba(2, 6, 23, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;