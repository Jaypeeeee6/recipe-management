import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { DialogsProvider } from "./dialogs/DialogsContext";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DialogsProvider>
          <App />
        </DialogsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
