import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles-v8-final.css";
import "./styles-v9.css";
import "./styles-v19-final.css";
import "./styles-v20-brand.css";
import "./styles-v21-growth.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { scope: "./" });
  });
}
