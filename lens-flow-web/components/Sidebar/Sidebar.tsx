import React from "react";
import { NavLink } from "react-router-dom";
import { Home, PackagePlus, MapPin, History, FileText } from "lucide-react";
const navItems = [
  { to: "/", icon: <Home size={20} />, label: "Dashboard" },
  { to: "/service-entry", icon: <PackagePlus size={20} />, label: "Service Entry" },
  { to: "/box-tracking", icon: <MapPin size={20} />, label: "Tracking" },
  { to: "/movement-history", icon: <History size={20} />, label: "History" },
  { to: "/reports", icon: <FileText size={20} />, label: "Reports" },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-white min-h-screen shadow-lg border-r border-gray-200">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded">
          LensFlow
        </h1>
      </div>
      <nav className="space-y-1 px-3">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
              }`
            }
          >
            <span className="inline-flex items-center justify-center">{icon}</span>
            <span className="ml-8 text-base transition-all duration-300">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
