import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          500: '#3d7fff',
          600: '#2f66db',
          700: '#254fb0',
        },
      },
    },
  },
  plugins: [],
};

export default config;
