import React, { useEffect, useState } from 'react';
import BoxCard from '../BoxCard/BoxCard.jsx';

type Movement = {
    id: string;
    clientName: string;
    orderService: string;
    note: string;
    box: {
      color: string;
      number?: string | number;
      _id?: string;
    }
};

const fetchMovements = async (): Promise<Movement[]> => {
    return [
        {
            id: '1',
            clientName: 'Otica Gomes',
            orderService: '4892',
            note: '',
            box: {
                color: 'verde',
                number: 100,
                _id: 'box-001',
            },
        },
        {
            id: '2',
            clientName: 'Otica Perfil',
            orderService: '002 Agosto',
            note: 'Urgente',
            box: {
                color: 'vermelho',
                number: 101,
                _id: 'box-002',
            },
        },
        {
            id: '3',
            clientName: 'Weverton',
            orderService: 'Maria das Gracas',
            note: 'Sem Armacao',
            box: {
                color: 'branco',
                number: 102,
                _id: 'box-003',
            },
        },
    ];
};

const MovementList: React.FC = () => {
    const [movements, setMovements] = useState<Movement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMovements().then(data => {
            setMovements(data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div>Carregando movimentos...</div>;

    return (
        <div className="grid grid-cols-3 gap-6 m-4">
            {movements.map(movement => (
                <BoxCard
                    key={movement.id}
                    clientName={movement.clientName}
                    orderService={movement.orderService}
                    note={movement.note}
                    box={movement.box}
                />
            ))}
        </div>
    );
};

export default MovementList;
