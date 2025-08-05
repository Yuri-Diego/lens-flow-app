import React from "react";

export function PageContainer({ title, children }) {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8">
      {title && (
        <h1 className="text-2xl font-semibold text-gray-900 mb-6 border-b-0 pb-1">
          {title}
        </h1>
      )}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        {children}
      </div>
    </div>
  );
}
