
const BoxCard = ({ clientName, orderService = 'Sem OS', note = '', box }) => {
   const boxNumber = box?.number || 'N/A';
   const boxColor = box?.color || 'white';

return (
    <div
        className="rounded-3xl m-[5px] p-6 max-w-sm cursor-default shadow-md relative text-center"
        style={{ backgroundColor: boxColor, color: (boxColor == '#1A1A1A' || boxColor == '#2f4057ff') ? 'white' : 'black' }}
    >
        {/* Conteúdo centralizado */}
        <div className="flex flex-col items-center gap-2">
            {/* Linha 1: Número da box - clientName */}
            <div className="flex items-center gap-2 text-lg font-semibold">
                <span className="font-mono select-none">{boxNumber}  </span>
                <span>| {clientName}</span>
            </div>

            {/* Linha 2: orderService - note (se existir) */}
            <div className="flex items-center gap-2 text-lg font-semibold">
                <span>{orderService}</span>
                {note && <span className="opacity-80"> | {note}</span>}
            </div>
        </div>
    </div>
);
};

export default BoxCard;
