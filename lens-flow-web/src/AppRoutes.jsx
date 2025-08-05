import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "../components/Sidebar/Sidebar.tsx";
import Home from "../pages/Home/Home.jsx";
import "./App.css";

function AppRoutes() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50 text-gray-800">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/Home" element={<Home />} />
            <Route path="/Admin" element={<Home />} />
            <Route path="*" element={<Navigate to="/Home" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default AppRoutes;
