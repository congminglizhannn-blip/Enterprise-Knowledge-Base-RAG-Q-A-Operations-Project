/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Noto Sans SC",
          "Source Han Sans SC",
          "Microsoft YaHei",
          "Inter",
          "sans-serif"
        ],
      },
      colors: {
        brand: {
          50: "#f4faff",
          100: "#e8f4ff",
          200: "#cfe6ff",
          500: "#4f8fcf",
          600: "#2f73b7",
          700: "#245f9a"
        }
      }
    },
  },
  plugins: [],
};
