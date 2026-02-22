import { Routes, Route, NavLink } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Logs from "./pages/Logs.jsx";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Gofrugal DB Synker</h1>
        <p className="tagline">Sync SQL Server tables to the backend</p>
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
