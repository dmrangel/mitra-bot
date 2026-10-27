const { OPCOES: opcoesDoMenu, menuNumerado, opcaoAtiva } = require('../conteudo');
const relogio = require('./relogio');

// Marcas de acentuacao combinantes (U+0300-U+036F), em ASCII puro para
// nao depender da codificacao do arquivo.
const ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizar(valor) {
    return String(valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(ACENTOS, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Só letras, números e espaços: "Obrigada!! 🙏" -> "obrigada". */
function palavrasDe(texto) {
    return normalizar(texto).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function escaparRegex(valor) {
    return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Reconhecimento do menu
//
// 1. Número da opção (a posição no menu do dia, ver conteudo.js), aceitando o jeito como as pessoas digitam: "1", "1.",
//    "1)", "opção 1", "1️⃣".
// 2. Palavras-chave (conteudo.js): palavra inteira vale mais que trecho solto,
//    mais palavras batendo vence menos palavras e, no empate, a expressão mais
//    longa vence ("falar com a secretaria" ganha de "secretaria").
// ---------------------------------------------------------------------------

const OPCOES = opcoesDoMenu.map(opt => ({
    opcao: opt,
    termos: (opt.palavras || []).map(kw => {
        const alvo = normalizar(kw);
        return { alvo, regex: new RegExp(`(^|[^a-z0-9])${escaparRegex(alvo)}([^a-z0-9]|$)`) };
    })
}));

const NUMERO_DA_OPCAO = /^(?:(?:opcao|opc|op|numero|n|item)\s*)?(\d{1,2})$/;

function opcaoPorNumero(texto, data) {
    const m = NUMERO_DA_OPCAO.exec(palavrasDe(texto).join(' '));
    if (!m) return null;
    const numero = String(Number(m[1]));
    const achada = menuNumerado(data).find(o => o.numero === numero);
    return achada ? achada.opcao : null;
}

/** A opção pedida no texto, considerando só as opções no ar nesta data. */
function encontrarOpcao(texto, data = relogio.agora()) {
    if (!texto) return null;

    const porNumero = opcaoPorNumero(texto, data);
    if (porNumero) return porNumero;

    let melhor = null;
    for (const entrada of OPCOES) {
        if (!opcaoAtiva(entrada.opcao, data)) continue;
        let palavras = 0, maiorPalavra = 0, trechos = 0, maiorTrecho = 0;
        for (const termo of entrada.termos) {
            if (termo.regex.test(texto)) {
                palavras++;
                maiorPalavra = Math.max(maiorPalavra, termo.alvo.length);
            } else if (termo.alvo.length >= 5 && texto.includes(termo.alvo)) {
                // Trecho solto só para termos longos: "batizadinho" acha
                // "batizado", mas "pix" não acha nada dentro de outra palavra.
                trechos++;
                maiorTrecho = Math.max(maiorTrecho, termo.alvo.length);
            }
        }
        if (palavras === 0 && trechos === 0) continue;

        const nota = [palavras, maiorPalavra, trechos, maiorTrecho];
        if (!melhor || compararNotas(nota, melhor.nota) > 0) {
            melhor = { opcao: entrada.opcao, nota };
        }
    }
    return melhor ? melhor.opcao : null;
}

/** Compara duas notas na ordem dos critérios. > 0 se `a` é melhor que `b`. */
function compararNotas(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Despedidas e confirmações
//
// Antes, qualquer resposta que CONTIVESSE "nao" ou "nada" encerrava a
// conversa: "não sei o horário da missa" recebia a despedida. Agora a
// mensagem inteira precisa ser feita só dessas palavras.
// ---------------------------------------------------------------------------

// Pelo menos uma destas precisa aparecer para ser despedida.
const DESPEDIDA = new Set([
    'nao', 'n', 'nada', 'obrigado', 'obrigada', 'obrigadao', 'obrigadinho', 'obrigadinha',
    'obg', 'brigado', 'brigada', 'grato', 'grata', 'agradeco', 'valeu', 'vlw', 'tchau',
    'encerrar', 'encerra', 'so'
]);
// Podem acompanhar a despedida ("não, muito obrigada, Deus abençoe").
const ACOMPANHA = new Set([
    'muito', 'mto', 'mt', 'isso', 'era', 'por', 'enquanto', 'ok', 'certo', 'ta', 'beleza',
    'deus', 'abencoe', 'amem', 'boa', 'bom', 'noite', 'tarde', 'dia', 'de', 'mesmo',
    'entendi', 'perfeito', 'otimo', 'a', 'o', 'voce', 'voces', 'sim', 'mais', 'e', 'pela',
    'pelo', 'informacao', 'informacoes', 'atencao'
]);
// Confirmações curtas que não pedem nada: não devem reenviar o menu inteiro.
// "sim" fica de fora de propósito: depois de "Posso ajudar com mais alguma
// coisa?", "sim" pede o menu.
const CONFIRMACAO = new Set([
    'ok', 'okay', 'okk', 'certo', 'ta', 'tah', 'beleza', 'blz', 'entendi', 'perfeito',
    'otimo', 'show', 'joia', 'legal', 'amem', 'ah', 'hum', 'hmm', 'aham', 'uhum'
]);

function ehDespedida(texto) {
    const palavras = palavrasDe(texto);
    if (palavras.length === 0 || palavras.length > 8) return false;
    // Qualquer palavra fora das listas ("não SEI o horário") tira da despedida.
    return palavras.some(p => DESPEDIDA.has(p)) &&
        palavras.every(p => DESPEDIDA.has(p) || ACOMPANHA.has(p));
}

/** "ok", "👍", "entendi": a pessoa só acusou o recebimento. */
function ehConfirmacao(texto) {
    const original = String(texto || '').trim();
    if (!original) return false;
    const palavras = palavrasDe(original);
    // Só emoji ou pontuação ("👍", "🙏", "!!").
    if (palavras.length === 0) return true;
    return palavras.length <= 3 && palavras.every(p => CONFIRMACAO.has(p));
}

module.exports = { normalizar, palavrasDe, encontrarOpcao, ehDespedida, ehConfirmacao };
