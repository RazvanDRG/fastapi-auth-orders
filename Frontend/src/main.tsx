import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "react-hot-toast";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
          <Toaster
            position="top-center"
            containerStyle={{
              top: 80, // 👈 coboară toast-ul
            }}
            toastOptions={{
              duration: 3000,
              style: {
                background: "#0f172a",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: "16px",
                padding: "16px 20px",
                fontSize: "15px",
                maxWidth: "420px",
                boxShadow: "0 25px 50px rgba(0, 0, 0, 0.45)",
              },
              success: {
                iconTheme: {
                  primary: "#22c55e",
                  secondary: "#0f172a",
                },
              },
              error: {
                iconTheme: {
                  primary: "#f43f5e",
                  secondary: "#0f172a",
                },
              },
            }}
          />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
