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
    <aside className="w-1/5 bg-gray-50 min-h-screen p-4">
      <div className="text-2xl font-semibold mb-8 select-none">LensFlow</div>
      <nav className="flex flex-col h-full">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className="relative flex items-center gap-4 h-14 px-4 rounded-lg font-medium text-gray-700 hover:text-blue-600 transition-colors duration-300"
          >
            {icon}
            <span className="ml-8 text-base transition-all duration-300">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
