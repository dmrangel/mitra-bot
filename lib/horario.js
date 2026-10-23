const { DADOS } = require('../conteudo');

// ---------------------------------------------------------------------------
// A secretaria está aberta agora? Usa o horário de conteudo.js, sempre no fuso
// de Brasília: a VM roda em UTC e, sem isto, o bot acharia que a secretaria
// fecha às 15h30.
//
// Feriados não são considerados: num feriado em dia útil o bot diz que há
// alguém para atender.
// ---------------------------------------------------------------------------

const FUSO = 'America/Sao_Paulo';
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatador = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

const minutos = hhmm => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** Dia da semana (0 = domingo) e minutos desde a meia-noite, no fuso de Brasília. */
function agoraEmBrasilia(data) {
    const partes = Object.fromEntries(formatador.formatToParts(data).map(p => [p.type, p.value]));
    return {
        dia: DIAS[partes.weekday],
        minuto: Number(partes.hour) * 60 + Number(partes.minute)
    };
}

function secretariaAberta(data = new Date(), horario = DADOS.horarioSecretaria) {
    const { dia, minuto } = agoraEmBrasilia(data);
    return horario.some(f => f.dias.includes(dia) && minuto >= minutos(f.abre) && minuto < minutos(f.fecha));
}

module.exports = { secretariaAberta, agoraEmBrasilia };
