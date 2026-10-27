const test = require('node:test');
const assert = require('node:assert/strict');

const relogio = require('../lib/relogio');
const { normalizar, encontrarOpcao, ehDespedida, ehConfirmacao } = require('../lib/menuMatcher');

// Data fixa fora de campanhas temporárias: o menu fica 1 = Missas ... 8 = Atendente,
// não importa o dia em que o teste roda. Testes de campanha passam a data.
const SEM_CAMPANHA = new Date('2026-12-10T13:00:00Z');
relogio.agora = () => SEM_CAMPANHA;

test('normalizar remove acentos, baixa a caixa e colapsa espaços', () => {
    assert.equal(normalizar('  Missa   Amanhã '), 'missa amanha');
    assert.equal(normalizar(undefined), '');
    assert.equal(normalizar(null), '');
});

test('encontrarOpcao reconhece o número do menu', () => {
    assert.equal(encontrarOpcao(normalizar('1')).chave, 'missas');
    assert.equal(encontrarOpcao(normalizar('8')).chave, 'atendente');
});

test('encontrarOpcao reconhece palavra-chave dentro de uma frase', () => {
    assert.equal(encontrarOpcao(normalizar('quero saber o horario da missa')).chave, 'missas');
    assert.equal(encontrarOpcao(normalizar('quero fazer uma doação via pix')).chave, 'doacoes');
});

test('"atendimento humano" cai na opção 8, não na 6 (regressão documentada)', () => {
    // "atendimento" é palavra-chave tanto da opção 6 (Secretaria) quanto da 8
    // (Atendimento Humano). Um find() ingênuo sempre escolhia a 6 primeiro.
    assert.equal(encontrarOpcao(normalizar('atendimento humano')).chave, 'atendente');
    assert.equal(encontrarOpcao(normalizar('quero atendimento humano por favor')).chave, 'atendente');
});

test('"atendimento" sozinho leva ao atendente (8), não ao endereço da secretaria (6)', () => {
    assert.equal(encontrarOpcao(normalizar('atendimento')).chave, 'atendente');
    assert.equal(encontrarOpcao(normalizar('quero falar com a secretaria')).chave, 'atendente');
    assert.equal(encontrarOpcao(normalizar('qual o endereço da secretaria?')).chave, 'secretaria');
});

const CH = { 1: 'missas', 2: 'oracao', 3: 'batismo', 4: 'casamentos', 5: 'doacoes', 6: 'secretaria', 7: 'redes', 8: 'atendente' };

test('número da opção do jeito que as pessoas digitam', () => {
    for (const [digitado, id] of [['1.', '1'], ['2)', '2'], ['opção 3', '3'], ['Opcao 4', '4'], ['1️⃣', '1'], ['*5*', '5'], ['06', '6'], [' 7 ', '7']]) {
        const achada = encontrarOpcao(normalizar(digitado));
        assert.equal(achada && achada.chave, CH[id], digitado);
    }
    assert.equal(encontrarOpcao(normalizar('9')), null, 'número que não existe no menu');
    assert.equal(encontrarOpcao(normalizar('12')), null);
});

test('frases comuns de conversa não disparam respostas que ninguém pediu', () => {
    for (const frase of ['graças a Deus', 'me ajuda por favor', 'quando vocês podem me responder?', 'que dia é hoje', 'vou falar com a pessoa', 'qual o valor?', 'me conta uma coisa']) {
        assert.equal(encontrarOpcao(normalizar(frase)), null, frase);
    }
});

test('perguntas reais caem na opção certa', () => {
    const casos = {
        'quero saber o horário da missa de domingo': '1',
        'como marco uma intenção para minha avó falecida?': '1',
        'rezem pela minha família por favor': '2',
        'como faço pra batizar meu filho': '3',
        'preciso de uma certidão': 'certidao',
        'quanto custa o casamento': '4',
        'qual a chave pix?': '5',
        'onde fica a igreja?': '6',
        'qual o instagram de vocês': '7'
    };
    for (const [frase, id] of Object.entries(casos)) {
        const achada = encontrarOpcao(normalizar(frase));
        assert.equal(achada && achada.chave, CH[id] || id, frase);
    }
});

test('trecho solto só conta para palavras longas', () => {
    // "casamentozinho" contém "casamento"; "pixel" contém "pix", mas não é PIX.
    assert.equal(encontrarOpcao(normalizar('um casamentozinho simples')).chave, 'casamentos');
    assert.equal(encontrarOpcao(normalizar('pixel')), null);
});

test('texto sem nenhuma palavra-chave não encontra opção', () => {
    assert.equal(encontrarOpcao(normalizar('xyzxyz não existe em lugar nenhum')), null);
    assert.equal(encontrarOpcao(''), null);
    assert.equal(encontrarOpcao(null), null);
});

test('despedida: só quando a mensagem inteira é despedida', () => {
    for (const t of ['não', 'Não, obrigada', 'nada', 'só isso', 'Muito obrigado!', 'obrigada pela informação', 'Não, muito obrigada! Deus abençoe 🙏', 'tchau', 'valeu']) {
        assert.equal(ehDespedida(normalizar(t)), true, t);
    }
    // A regressão: antes qualquer "não" no meio da frase encerrava a conversa.
    for (const t of ['não sei o horário da missa', 'não encontrei a chave pix', 'nada disso, quero casar', 'sim', 'ok', 'bom dia', '', 'obrigada, e o horário da missa?']) {
        assert.equal(ehDespedida(normalizar(t)), false, t);
    }
});

test('confirmação curta: "ok", "entendi", emoji; "sim" e perguntas não contam', () => {
    for (const t of ['ok', 'Ok!', 'certo', 'entendi', '👍', '🙏🙏', 'amém']) {
        assert.equal(ehConfirmacao(t), true, t);
    }
    for (const t of ['sim', 'ok mas e a missa?', '', 'entendi, e o batismo?']) {
        assert.equal(ehConfirmacao(t), false, t);
    }
});

// --- Campanha temporária (Mês das Almas) -------------------------------------

const EM_NOVEMBRO = new Date('2026-11-10T13:00:00Z');
const ULTIMO_MINUTO = new Date('2026-12-01T02:59:00Z'); // 30/11, 23h59 em Brasília
const VIROU = new Date('2026-12-01T03:00:00Z'); // 01/12, 0h em Brasília

test('campanha no ar: é a opção 1 e as outras descem uma posição', () => {
    assert.equal(encontrarOpcao('1', EM_NOVEMBRO).chave, 'almas');
    assert.equal(encontrarOpcao('2', EM_NOVEMBRO).chave, 'missas');
    assert.equal(encontrarOpcao('9', EM_NOVEMBRO).chave, 'atendente');
    assert.equal(encontrarOpcao('1', ULTIMO_MINUTO).chave, 'almas');
});

test('campanha encerrada (01/12, fuso de Brasília): some, a numeração volta e as palavras-chave param de valer', () => {
    assert.equal(encontrarOpcao('1', VIROU).chave, 'missas');
    assert.equal(encontrarOpcao('8', VIROU).chave, 'atendente');
    assert.equal(encontrarOpcao('9', VIROU), null);
    assert.equal(encontrarOpcao(normalizar('mes das almas'), VIROU), null);
});

test('campanha: palavras-chave da campanha e nomes de falecidos', () => {
    assert.equal(encontrarOpcao(normalizar('quero participar do mês das almas'), EM_NOVEMBRO).chave, 'almas');
    assert.equal(encontrarOpcao(normalizar('vou mandar os nomes dos falecidos'), EM_NOVEMBRO).chave, 'almas');
    // Marcar intenção de missa continua em Missas, mesmo durante a campanha.
    assert.equal(encontrarOpcao(normalizar('quero marcar missa para um falecido'), EM_NOVEMBRO).chave, 'missas');
});
