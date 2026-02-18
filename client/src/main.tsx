import { createRoot } from "react-dom/client";
import React, { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#0f172a",
            color: "#e2e8f0",
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <h1 style={{ fontSize: "1.25rem", marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: 16 }}>
              {this.state.error.message}
            </p>
            <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Open the browser console (F12 → Console) for more details. Fix
              the error and refresh the page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function showFatalError(message: string, detail?: string) {
  const root = document.getElementById("root");
  if (!root) document.body.innerHTML = "<p>Root not found.</p>";
  else {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;box-sizing:border-box;">
        <div style="max-width:560px;">
          <h1 style="font-size:1.25rem;margin:0 0 8px;">Something went wrong</h1>
          <p style="color:#94a3b8;margin:0 0 8px;">${String(message).replace(/</g, "&lt;")}</p>
          ${detail ? `<pre style="font-size:0.75rem;color:#64748b;overflow:auto;margin:0 0 16px;">${String(detail).replace(/</g, "&lt;")}</pre>` : ""}
          <button type="button" onclick="location.reload()" style="padding:8px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;">Reload</button>
        </div>
      </div>
    `;
  }
}

const root = document.getElementById("root");
if (!root) {
  document.body.innerHTML = "<p style='padding:24px;'>Root element not found.</p>";
} else {
  try {
    createRoot(root).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = err instanceof Error ? err.stack : undefined;
    console.error("Bootstrap error:", err);
    showFatalError(message, detail);
  }
}
