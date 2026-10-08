import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

import "./style.css";

const container = document.querySelector("#root");
if (!container) {
  throw new Error("Popup root element is missing.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
