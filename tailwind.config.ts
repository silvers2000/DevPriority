import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          900: '#0D1117',
          800: '#161B22',
          700: '#21262D',
          600: '#30363D',
        },
        amber: {
          500: '#F0A500',
          400: '#FFB800',
          300: '#FFCB47',
        },
        status: {
          success: '#2EA043',
          warning: '#D29922',
          error: '#F85149',
          info: '#58A6FF',
        },
      },
    },
  },
  plugins: [],
};
export default config;
