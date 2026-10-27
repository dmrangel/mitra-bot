// Fonte única de "agora" para o que depende de data e hora (horário da
// secretaria, opções temporárias do menu). Os testes trocam relogio.agora por
// uma data fixa para não dependerem do dia em que rodam.
const relogio = {
    agora: () => new Date()
};

module.exports = relogio;
