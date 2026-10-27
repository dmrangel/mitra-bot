const test = require('node:test');
const assert = require('node:assert/strict');

const relogio = require('../lib/relogio');
const { DADOS, OPCOES, MSG, menuNumerado, montarMenu } = require('../conteudo');

const SEM_CAMPANHA = new Date('2026-12-10T13:00:00Z');
const EM_NOVEMBRO = new Date('2026-11-10T13:00:00Z');
const { normalizar } = require('../lib/menuMatcher');

test('chaves únicas; opções temporárias têm data no formato AAAA-MM-DD', () => {
    const chaves = OPCOES.map(o => o.chave);
    assert.equal(new Set(chaves).size, chaves.length);
    for (const o of OPCOES.filter(x => x.ate)) assert.match(o.ate, /^\d{4}-\d{2}-\d{2}$/, o.chave);
});

test('o menu lista as opções numeradas na ordem, sem as de fora do menu', () => {
    for (const data of [SEM_CAMPANHA, EM_NOVEMBRO]) {
        const menu = montarMenu(data);
        let posicao = -1;
        for (const { numero, opcao } of menuNumerado(data)) {
            const achada = menu.indexOf(`*${numero}* · ${opcao.titulo}`);
            assert.ok(achada > posicao, `faltou ou fora de ordem: ${opcao.titulo}`);
            posicao = achada;
        }
        for (const o of OPCOES.filter(x => x.noMenu)) assert.ok(!menu.includes(o.titulo), o.titulo);
    }
});

test('fora da campanha o menu tem 8 opções; durante, 9 com a campanha em 1º', () => {
    assert.equal(menuNumerado(SEM_CAMPANHA).length, 8);
    assert.equal(menuNumerado(SEM_CAMPANHA)[0].opcao.chave, 'missas');
    assert.equal(menuNumerado(EM_NOVEMBRO).length, 9);
    assert.equal(menuNumerado(EM_NOVEMBRO)[0].opcao.chave, 'almas');
    assert.ok(!montarMenu(SEM_CAMPANHA).includes('Mês das Almas'));
});

test('MSG.menu segue o relógio', () => {
    const original = relogio.agora;
    try {
        relogio.agora = () => EM_NOVEMBRO;
        assert.ok(MSG.menu.includes('*1* · Campanha Mês das Almas'));
        relogio.agora = () => SEM_CAMPANHA;
        assert.ok(MSG.menu.includes('*1* · Missas e confissões'));
    } finally {
        relogio.agora = original;
    }
});

test('nenhuma palavra-chave aparece em duas opções (o bot não saberia qual escolher)', () => {
    const dono = new Map();
    for (const o of OPCOES) {
        for (const p of o.palavras) {
            const chave = normalizar(p);
            assert.ok(!dono.has(chave), `"${p}" está na opção ${dono.get(chave)} e na ${o.chave}`);
            dono.set(chave, o.chave);
        }
    }
});

test('toda opção tem resposta; as com função respondem dentro e fora do horário', () => {
    for (const o of OPCOES) {
        const respostas = typeof o.resposta === 'function'
            ? [o.resposta({ secretariaAberta: true }), o.resposta({ secretariaAberta: false })]
            : [o.resposta];
        for (const r of respostas) assert.ok(typeof r === 'string' && r.trim().length > 20, `opção ${o.chave}`);
    }
    assert.ok(['oracao', 'certidao', 'almas', 'atendente'].every(a => OPCOES.some(o => o.acao === a)));
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
    const atendente = OPCOES.find(o => o.chave === 'atendente');
    assert.match(atendente.resposta({ secretariaAberta: false }), /fechada/);
    assert.doesNotMatch(atendente.resposta({ secretariaAberta: true }), /fechada/);
});

test('Batismo e certidões ensina a pedir a certidão por aqui', () => {
    assert.match(OPCOES.find(o => o.chave === 'batismo').resposta, /envie \*certidão\*/);
});

test('campanha: texto com os horários da Missa pelas Almas e o PIX; link novo do Instagram', () => {
    const almas = OPCOES.find(o => o.chave === 'almas');
    for (const trecho of ['Segunda a sexta: 7h', 'Sábado: 8h', 'Domingo: 9h', DADOS.pix, 'Envie aqui os nomes']) {
        assert.ok(almas.resposta.includes(trecho), trecho);
    }
    assert.ok(OPCOES.find(o => o.chave === 'redes').resposta.includes('https://www.instagram.com/santuariodesantaritarj'));
});
