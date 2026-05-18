import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#FAF7F2",
          dark: "#1F1612",
          text: "#2A1E18",
          coral: "#E94B3C",
          amber: "#F2A03D",
          olive: "#7A8C4F",
          brown: "#8B6B4F",
          plum: "#8E4F6B",
          line: "#ECE5DC",
          subtle: "#6B5D52",
          mute: "#B8A99A",
        },
      },
      fontFamily: {
        sans: [
          "Apple SD Gothic Neo",
          "Pretendard",
          "Noto Sans KR",
          "-apple-system",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
