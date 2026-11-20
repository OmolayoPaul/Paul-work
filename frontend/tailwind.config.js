/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F4F6F2",
        line: "#E3E8E1",
        ink: {
          DEFAULT: "#0E1F18",
          soft: "#4C5C54",
          muted: "#7C8B83",
        },
        forest: {
          50: "#F0FAF4",
          100: "#DCF3E5",
          200: "#B6E6CC",
          300: "#84D3AC",
          400: "#4FBB87",
          500: "#2AA26A",
          600: "#1C8355",
          700: "#176947",
          800: "#124F37",
          900: "#0C3A29",
          950: "#062318",
        },
        accent: {
          DEFAULT: "#22C55E",
          soft: "#DCFCE7",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(12, 58, 41, 0.06)",
        lift: "0 18px 40px -24px rgba(12, 58, 41, 0.35)",
      },
    },
  },
  plugins: [],
};
