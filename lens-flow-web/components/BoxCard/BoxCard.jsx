import React from 'react';
import { Info } from "lucide-react";

const colorMap = {
  verde: '#4ade80',
  vermelho: '#f87171',
  azul: '#60a5fa',
  amarelo: '#fbbf24',
  cinza: '#9ca3af',
  preto: '#000000',
  branco: '#ffffff',
};

const BoxCard = ({ clientName, orderService = 'Sem OS', note = '', box }) => {
  const boxColorRaw = box?.color || '#e5e7eb';
  const boxColor = colorMap[boxColorRaw.toLowerCase()] || boxColorRaw;
  const boxNumber = box?.number || box?._id || 'N/A';

return (
    <div
        className="rounded-3xl m-[5px] p-6 max-w-sm cursor-default shadow-md relative text-center"
        style={{ backgroundColor: boxColor, color: 'black' }}
    >
        {/* Conteúdo centralizado */}
        <div className="flex flex-col items-center gap-2">
            {/* Linha 1: Número da box - clientName */}
            <div className="flex items-center gap-2 text-lg font-semibold">
                <span className="font-mono select-none">{boxNumber} | </span>
                <span>| {clientName}</span>
            </div>

            {/* Linha 2: orderService - note (se existir) */}
            <div className="flex items-center gap-2 text-sm italic">
                <span>{orderService} |</span>
                {note && <span className="opacity-80"> | {note}</span>}
            </div>
        </div>
    </div>
);
};

export default BoxCard;
