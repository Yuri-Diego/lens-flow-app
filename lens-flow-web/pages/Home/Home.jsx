import React from "react";
import { PageContainer } from "../../components/PageContainer/PageContainer.jsx";
import MovementList from "../../components/MovementList/MovementList.jsx";

export default function Home() {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

return (
    <PageContainer title={`Última folha de movimentações - ${today}`}>
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-medium text-gray-800">Movimentações de hoje</h2>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    Atualizar
                </button>
            </div>
            <MovementList date={today} />
        </div>
    </PageContainer>
)}
