import { useEffect } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Home from "./pages/Home.jsx";
import Logs from "./pages/Logs.jsx";
import { applyTheme, getLogoUrl } from "./theme";
import "./App.css";

export default function App() {
  useEffect(() => {
    applyTheme();
  }, []);

  const logoUrl = getLogoUrl();

  return (
    <div className="app">
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      <header className="app-header">
        <div className="app-header-brand">
          {logoUrl && (
            <img src={logoUrl} alt="" className="app-logo" />
          )}
          <div>
            <h1 className="app-title">Gofrugal DB Synker</h1>
            <p className="tagline">Sync SQL Server tables to the backend</p>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")} end>
            Home
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
            Logs
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </main>
    </div>
  );
}
