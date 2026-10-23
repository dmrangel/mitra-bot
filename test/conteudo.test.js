const test = require('node:test');
const assert = require('node:assert/strict');

const { DADOS, OPCOES, MSG } = require('../conteudo');
const { normalizar } = require('../lib/menuMatcher');

const NO_MENU = OPCOES.filter(o => !o.noMenu);

test('opções do menu numeradas de 1 em diante, sem repetir; as de fora do menu não usam número', () => {
    assert.deepEqual(NO_MENU.map(o => o.id), NO_MENU.map((_, i) => String(i + 1)));
    for (const o of OPCOES.filter(x => x.noMenu)) assert.doesNotMatch(o.id, /^\d+$/, o.id);
});

test('o menu principal lista todas as opções numeradas, na ordem, e só elas', () => {
    for (const o of OPCOES.filter(x => x.noMenu)) assert.ok(!MSG.menu.includes(o.titulo), o.titulo);
    let posicao = -1;
    for (const o of NO_MENU) {
        const linha = `*${o.id}* · ${o.titulo}`;
        const achada = MSG.menu.indexOf(linha);
        assert.ok(achada > posicao, `faltou ou fora de ordem: ${linha}`);
        posicao = achada;
    }
});

test('nenhuma palavra-chave aparece em duas opções (o bot não saberia qual escolher)', () => {
    const dono = new Map();
    for (const o of OPCOES) {
        for (const p of o.palavras) {
            const chave = normalizar(p);
            assert.ok(!dono.has(chave), `"${p}" está na opção ${dono.get(chave)} e na ${o.id}`);
            dono.set(chave, o.id);
        }
    }
});

test('toda opção tem resposta; as com função respondem dentro e fora do horário', () => {
    for (const o of OPCOES) {
        const respostas = typeof o.resposta === 'function'
            ? [o.resposta({ secretariaAberta: true }), o.resposta({ secretariaAberta: false })]
            : [o.resposta];
        for (const r of respostas) assert.ok(typeof r === 'string' && r.trim().length > 20, `opção ${o.id}`);
    }
    assert.ok(['oracao', 'certidao', 'atendente'].every(a => OPCOES.some(o => o.acao === a)));
});

test('os valores e dados de contato continuam nos textos', () => {
    const tudo = OPCOES.map(o => (typeof o.resposta === 'function' ? o.resposta({ secretariaAberta: true }) : o.resposta)).join('\n');
    for (const trecho of ['R$ 150', 'R$ 5 por intenção', 'R$ 15', 'R$ 50', 'R$ 3.500,00', '150 pessoas',
        'Agência 0436', 'Conta poupança 6682220-6', '33.593.575/0222-74', '2240-2869', 'arquivodacuriarj@arqrio.org.br',
        DADOS.pix, DADOS.endereco, ...DADOS.telefones, '6h30 às 18h30', '8h às 12h', 'Domingo: 7h30 às 12h']) {
        assert.ok(tudo.includes(trecho), `sumiu do conteúdo: ${trecho}`);
    }
});

test('fora do horário a opção 8 avisa que a secretaria está fechada', () => {
    const atendente = OPCOES.find(o => o.acao === 'atendente');
    assert.match(atendente.resposta({ secretariaAberta: false }), /fechada/);
    assert.doesNotMatch(atendente.resposta({ secretariaAberta: true }), /fechada/);
});

test('a opção 3 ensina a pedir a certidão por aqui', () => {
    assert.match(OPCOES.find(o => o.id === '3').resposta, /envie \*certidão\*/);
});
