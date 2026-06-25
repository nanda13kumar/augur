import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; height: 100%; }
  body { background: #070A12; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1B2233; border-radius: 5px; border: 2px solid #070A12; }
  ::-webkit-scrollbar-thumb:hover { background: #2A344A; }
  @keyframes augurSpin { to { transform: rotate(360deg); } }
  @keyframes augurPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(242,109,109,0.4); }
    50% { box-shadow: 0 0 0 5px rgba(242,109,109,0); }
  }
  button:hover { filter: brightness(1.12); }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
