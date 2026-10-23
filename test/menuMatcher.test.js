const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizar, encontrarOpcao, ehDespedida, ehConfirmacao } = require('../lib/menuMatcher');

test('normalizar remove acentos, baixa a caixa e colapsa espaços', () => {
    assert.equal(normalizar('  Missa   Amanhã '), 'missa amanha');
    assert.equal(normalizar(undefined), '');
    assert.equal(normalizar(null), '');
});

test('encontrarOpcao reconhece o id exato do menu', () => {
    assert.equal(encontrarOpcao(normalizar('1')).id, '1');
    assert.equal(encontrarOpcao(normalizar('8')).id, '8');
});

test('encontrarOpcao reconhece palavra-chave dentro de uma frase', () => {
    assert.equal(encontrarOpcao(normalizar('quero saber o horario da missa')).id, '1');
    assert.equal(encontrarOpcao(normalizar('quero fazer uma doação via pix')).id, '5');
});

test('"atendimento humano" cai na opção 8, não na 6 (regressão documentada)', () => {
    // "atendimento" é palavra-chave tanto da opção 6 (Secretaria) quanto da 8
    // (Atendimento Humano). Um find() ingênuo sempre escolhia a 6 primeiro.
    assert.equal(encontrarOpcao(normalizar('atendimento humano')).id, '8');
    assert.equal(encontrarOpcao(normalizar('quero atendimento humano por favor')).id, '8');
});

test('"atendimento" sozinho leva ao atendente (8), não ao endereço da secretaria (6)', () => {
    assert.equal(encontrarOpcao(normalizar('atendimento')).id, '8');
    assert.equal(encontrarOpcao(normalizar('quero falar com a secretaria')).id, '8');
    assert.equal(encontrarOpcao(normalizar('qual o endereço da secretaria?')).id, '6');
});

test('número da opção do jeito que as pessoas digitam', () => {
    for (const [digitado, id] of [['1.', '1'], ['2)', '2'], ['opção 3', '3'], ['Opcao 4', '4'], ['1️⃣', '1'], ['*5*', '5'], ['06', '6'], [' 7 ', '7']]) {
        const achada = encontrarOpcao(normalizar(digitado));
        assert.equal(achada && achada.id, id, digitado);
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
        assert.equal(achada && achada.id, id, frase);
    }
});

test('trecho solto só conta para palavras longas', () => {
    // "casamentozinho" contém "casamento"; "pixel" contém "pix", mas não é PIX.
    assert.equal(encontrarOpcao(normalizar('um casamentozinho simples')).id, '4');
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
