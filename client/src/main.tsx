import { createRoot } from "react-dom/client";
import App from "./App";
// Self-hosted fonts (no third-party requests from visitors' browsers).
import "@fontsource-variable/inter";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
