import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyPerformanceMode, GameBridge } from "@moongames/game-sdk";
import App from "./App";
import "@moongames/game-ui/styles.css";
import "./styles.css";

applyPerformanceMode();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App bridge={new GameBridge()} />
  </StrictMode>,
);
