/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        court: {
          DEFAULT: "#0E5B3A",
          dark: "#0A4329",
          light: "#E8F3EC",
        },
        shuttle: {
          DEFAULT: "#FFFFFF",
          line: "#F4F1EA",
        },
        feather: {
          DEFAULT: "#E8A23D",
          dark: "#C97F1F",
        },
        ink: "#1C2420",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
