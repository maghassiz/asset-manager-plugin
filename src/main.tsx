import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"

// Default to dark before React mounts — App.tsx will load the saved
// preference from framer.getPluginData and update immediately after mount.
document.documentElement.classList.add("dark")
document.documentElement.style.colorScheme = "dark"

const root = document.getElementById("root")
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
