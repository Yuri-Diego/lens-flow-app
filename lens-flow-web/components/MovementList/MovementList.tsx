import React, { useEffect, useState } from 'react';
import BoxCard from '../BoxCard/BoxCard.jsx';
import axios from 'axios';

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
    try {
        const response = await axios.get('http://localhost:5000/movements');
        return response.data;
    } catch (error) {
        console.error('Erro ao tentar carregar Movements:', error);
        return [];
    }
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
