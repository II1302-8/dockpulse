import { StrictMode } from "react"; // Import React StrictMode.
import { createRoot } from "react-dom/client"; // Import React root creation.
import { App } from "./App"; // Import the main app component.
import "./app.css"; // Import global styles.

const rootElement = document.getElementById("app"); // Read the root element safely.

if (!rootElement) {
  throw new Error('Root element with id "app" was not found.'); // Stop early if the root element is missing.
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
); // Mount the app into the page root.
