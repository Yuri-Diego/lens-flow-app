const colorList = {
    branco: '#F8F9FA',   
    preto: '#1A1A1A',     
    vermelho: '#E74C3C',  
    verde: '#27AE60',     
    amarelo: '#ffee54ff',   
    azul: '#2f4057ff',    
};

export const getColorHex = (color) => {
    return colorList[color.toLowerCase()] || null;
}

