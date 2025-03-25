const colorList = {
    branco: '#FFFFFF',
    preto: '#000000',
    vermelho: '#FF0000',
    verde: '#00FF00',
    amarelo: '#FFFF00',
    azul: '#0000FF',
};

export const getColorHex = (color) => {
    return colorList[color.toLowerCase()] || null;
}

