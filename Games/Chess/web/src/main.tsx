import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameBridge } from "@moongames/game-sdk";
import App from "./App";
import { HostPreviewPanel } from "./preview/HostPreviewPanel";
import {
  BrowserPreviewHost,
  hostPreviewEnabled,
} from "./preview/hostPreview";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const previewHost = hostPreviewEnabled(window.location.search)
  ? new BrowserPreviewHost({
      locale:
        typeof navigator === "undefined" ? "en" : navigator.language || "en",
    })
  : null;
const bridge = new GameBridge(previewHost ?? undefined);

createRoot(rootElement).render(
  <StrictMode>
    <App bridge={bridge} />
    {previewHost === null ? null : <HostPreviewPanel host={previewHost} />}
  </StrictMode>,
);
