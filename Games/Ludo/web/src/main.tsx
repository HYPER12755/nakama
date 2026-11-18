import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyPerformanceMode, GameBridge } from "@moongames/game-sdk";
import {
  BrowserPreviewHost,
  hostPreviewEnabled,
  HostPreviewPanel,
} from "@moongames/game-ui";
import App from "./App";
import "@moongames/game-ui/styles.css";
import "./styles.css";

applyPerformanceMode();

const previewHost = hostPreviewEnabled(window.location.search)
  ? new BrowserPreviewHost({
      locale: typeof navigator === "undefined" ? "en" : navigator.language || "en",
    })
  : null;

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <App bridge={new GameBridge(previewHost ?? undefined)} />
    {previewHost === null ? null : <HostPreviewPanel host={previewHost} />}
  </StrictMode>,
);
