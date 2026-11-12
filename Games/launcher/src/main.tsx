import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyPerformanceMode } from "@moongames/game-sdk";
import App from "./App";
import { applyTheme, initialTheme } from "./lib/theme";
import "./styles.css";

applyPerformanceMode();
applyTheme(initialTheme());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
