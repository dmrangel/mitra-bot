const test = require('node:test');
const assert = require('node:assert/strict');

const os = require('os');
const path = require('path');

const { config } = require('../config');

// Os pedidos criados aqui não podem ir para o pedidos.json de verdade: rodar
// os testes na VM apagaria a fila de pedidos aguardando aprovação.
config.arquivoPedidos = path.join(os.tmpdir(), `mitra-bot-teste-fluxo-${process.pid}.json`);
test.after(() => require('fs').rmSync(config.arquivoPedidos, { force: true }));
// Idem para os testadores do modo teste (testadores.json).
config.arquivoTestadores = path.join(os.tmpdir(), `mitra-bot-teste-fluxo-testadores-${process.pid}.json`);
test.after(() => require('fs').rmSync(config.arquivoTestadores, { force: true }));
const { startupTime } = require('../lib/startup');
const { MSG } = require('../conteudo');
const MENU_PRINCIPAL = MSG.menu;

// Mocka o envio ANTES de requerer qualquer módulo que dependa dele (estado,
// timers, pedidos, fluxoConversa): o require cacheia o mesmo objeto, então a
// troca feita aqui é enxergada por todo mundo. Isso evita que os testes
// cheguem perto do whatsapp-web.js / Puppeteer de verdade.
const envio = require('../lib/envio');
const enviados = [];
envio.enviar = async (destino, texto) => { enviados.push({ destino, texto }); return true; };
envio.enviarParaTodos = async (destinos, texto) => {
    for (const destino of destinos) enviados.push({ destino, texto });
    return destinos.length;
};

const estado = require('../lib/estado');
const { MODO } = estado;
const timers = require('../lib/timers');
const pedidos = require('../lib/pedidos');
const testadores = require('../lib/testadores');
const { tratarMensagem, tratarComandoDoAparelho } = require('../lib/fluxoConversa');

let contador = 0;
function novoChatId() {
    contador += 1;
    return `55219${contador}0000000@c.us`;
}

function criarMsg(overrides) {
    return {
        from: novoChatId(),
        author: undefined,
        fromMe: false,
        hasMedia: false,
        body: '',
        timestamp: startupTime + 10,
        reply: async () => {},
        getContact: async () => ({ pushname: 'Contato Teste', number: '5521000000000' }),
        ...overrides
    };
}

test.beforeEach(() => {
    enviados.length = 0;
    config.blacklist = [];
    config.modoTeste = false;
    config.numeroTeste = '';
    config.numerosVerificacao = ['5521999999999@c.us'];
    config.gruposOracao = ['grupo-oracao@g.us'];
    config.gruposNotificacaoHumano = ['grupo-humano@g.us'];
    config.cooldownMs = 50; // pequeno só pra não segurar o processo de teste
    config.expiraHumanoMs = 6 * 60 * 60 * 1000;
    config.expiraOracaoMs = 30 * 60 * 1000;
    config.intervaloPedidoMs = 30 * 1000;
    config.testeValidadeMs = 24 * 60 * 60 * 1000;
    config.gruposOracaoTeste = [];
    testadores.testadores.clear();
});

// Roda sempre, mesmo se o teste falhar no meio: sem isso, um assert que
// estoura no meio do teste pula a limpeza manual e deixa timers reais de
// minutos (config.tempoAviso) pendurados, travando o processo de teste.
test.afterEach(() => {
    for (const chatId of [...timers.sessoes.keys()]) timers.limparTimers(chatId);
    estado.conversas.clear();
    estado.cooldown.clear();
    estado.ultimoPedido.clear();
    pedidos.pedidosPendentes.clear();
    testadores.testadores.clear();
});

test('"atendimento humano" cai na opção 8, não na 6 (regressão documentada)', async () => {
    const msg = criarMsg({ body: 'atendimento humano' });
    await tratarMensagem(msg);

    assert.equal(estado.modoDe(msg.from), MODO.ATENDENTE);
    const respostaCliente = enviados.find(e => e.destino === msg.from);
    assert.match(respostaCliente.texto, /Falar com um atendente/);
    const aviso = enviados.find(e => e.destino === 'grupo-humano@g.us');
    assert.ok(aviso, 'deveria notificar o grupo de atendimento humano');
});

test('pedido de oração escrito logo após escolher a opção 2 não é engolido pelo cooldown', async () => {
    const msg1 = criarMsg({ body: '2' });
    await tratarMensagem(msg1);
    assert.equal(estado.modoDe(msg1.from), MODO.ORACAO);

    const msg2 = criarMsg({ from: msg1.from, body: 'Por favor rezem pela minha mãe', timestamp: startupTime + 11 });
    await tratarMensagem(msg2);

    assert.equal(estado.modoDe(msg1.from), MODO.MENU);
    const confirmacao = enviados.find(e => e.destino === msg1.from && /Recebemos seu pedido de oração/.test(e.texto));
    assert.ok(confirmacao, 'deveria confirmar o recebimento do pedido');
    const notificacao = enviados.find(e => e.destino === '5521999999999@c.us' && /Novo pedido de oração para aprovar/.test(e.texto));
    assert.ok(notificacao, 'deveria notificar quem verifica pedidos');
    const pendente = [...pedidos.pedidosPendentes.values()].find(p => p.de === msg1.from);
    assert.ok(pendente, 'o pedido deveria estar na fila de aprovação');
});

test('segundo pedido dentro do intervalo anti-flood não duplica o aviso à secretaria', async () => {
    const chatId = novoChatId();
    // Simula quem já está no modo pedido de oração e acabou de enviar um.
    estado.definirModo(chatId, MODO.ORACAO);
    estado.ultimoPedido.set(chatId, Date.now());

    const msg = criarMsg({ from: chatId, body: 'outro pedido rápido demais' });
    await tratarMensagem(msg);

    assert.equal(enviados.some(e => /Novo pedido de oração para aprovar/.test(e.texto)), false);
    assert.ok(enviados.some(e => e.destino === chatId && /Acabamos de receber um pedido seu/.test(e.texto)));
});

test('estado especial expirado (silêncio prolongado) libera o menu de novo', async () => {
    const chatId = novoChatId();
    config.expiraHumanoMs = -1; // qualquer tempo decorrido já expira
    estado.definirModo(chatId, MODO.ATENDENTE);

    const msg = criarMsg({ from: chatId, body: 'bom dia' });
    await tratarMensagem(msg);

    assert.equal(estado.modoDe(chatId), MODO.MENU);
    const resposta = enviados.find(e => e.destino === chatId);
    assert.equal(resposta.texto, MENU_PRINCIPAL);
});

test('"voltar" durante atendimento humano reativa o menu automático', async () => {
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.ATENDENTE);

    const msg = criarMsg({ from: chatId, body: 'voltar' });
    await tratarMensagem(msg);

    assert.equal(estado.modoDe(chatId), MODO.MENU);
    // Uma mensagem só: aviso de volta + menu.
    assert.deepEqual(enviados, [{ destino: chatId, texto: MSG.voltouAoMenu }]);
    assert.ok(MSG.voltouAoMenu.endsWith(MENU_PRINCIPAL));
});

test('mensagem com mídia pede texto em vez de tentar interpretar', async () => {
    const msg = criarMsg({ hasMedia: true, body: '' });
    await tratarMensagem(msg);

    const resposta = enviados.find(e => e.destino === msg.from);
    assert.match(resposta.texto, /só consegue ler mensagens de texto/);
});

test('texto sem opção reconhecida recebe o menu principal', async () => {
    const msg = criarMsg({ body: 'aaaaaaaaaa' });
    await tratarMensagem(msg);

    const resposta = enviados.find(e => e.destino === msg.from);
    assert.equal(resposta.texto, MENU_PRINCIPAL);
});

test('blacklist, grupos, broadcast e modo teste são ignorados silenciosamente', async () => {
    const emBlacklist = criarMsg({ body: 'oi' });
    config.blacklist = [emBlacklist.from];
    await tratarMensagem(emBlacklist);
    assert.equal(enviados.length, 0);
    config.blacklist = [];

    const deGrupo = criarMsg({ from: 'algumgrupo@g.us', body: 'oi' });
    await tratarMensagem(deGrupo);
    assert.equal(enviados.length, 0);

    const statusBroadcast = criarMsg({ from: 'status@broadcast', body: 'oi' });
    await tratarMensagem(statusBroadcast);
    assert.equal(enviados.length, 0);

    const listaBroadcast = criarMsg({ from: '123@broadcast', body: 'oi' });
    await tratarMensagem(listaBroadcast);
    assert.equal(enviados.length, 0);

    config.modoTeste = true;
    config.numeroTeste = '5521000000001@c.us';
    const foraDoTeste = criarMsg({ body: 'oi' });
    await tratarMensagem(foraDoTeste);
    assert.equal(enviados.length, 0);
});

test('contato em pausa manual (!manual) não recebe respostas automáticas', async () => {
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.PAUSADO);

    const msg = criarMsg({ from: chatId, body: 'oi' });
    await tratarMensagem(msg);

    assert.equal(enviados.length, 0);
});

test('comando !idgrupo do próprio aparelho responde com o id da conversa', async () => {
    const msg = criarMsg({ fromMe: true, body: '!idgrupo' });
    await tratarMensagem(msg);
    assert.deepEqual(enviados, [{ destino: msg.from, texto: msg.from }]);
});

test('mensagem anterior ao boot do processo é ignorada', async () => {
    const msg = criarMsg({ body: '1', timestamp: startupTime - 100 });
    await tratarMensagem(msg);
    assert.equal(enviados.length, 0);
});

test('blacklist no formato antigo (@c.us) também bloqueia contatos que chegam pelo Baileys', async () => {
    config.blacklist = ['5521912340000@c.us'];
    const msg = criarMsg({ from: '5521912340000@s.whatsapp.net', body: 'oi' });
    await tratarMensagem(msg);
    assert.equal(enviados.length, 0);
});

test('modo teste reconhece o número de teste mesmo quando a conversa chega como @lid', async () => {
    config.modoTeste = true;
    config.numeroTeste = '5521912345678';
    const msg = criarMsg({
        from: '128277788291105@lid',
        aliases: ['128277788291105@lid', '5521912345678@s.whatsapp.net'],
        body: 'oi'
    });
    await tratarMensagem(msg);
    assert.ok(enviados.some(e => e.destino === msg.from));
});

// --- /teste (modo teste com inscrição) ---------------------------------------

test('modo teste: quem envia /teste passa a ser atendido; antes disso, e os outros contatos, ficam sem resposta', async () => {
    config.modoTeste = true;
    const testador = novoChatId();
    const outro = novoChatId();

    await tratarMensagem(criarMsg({ from: testador, body: 'oi' }));
    assert.equal(enviados.length, 0, 'sem /teste o bot fica calado');

    await tratarMensagem(criarMsg({ from: testador, body: '/teste' }));
    assert.ok(enviados.some(e => e.destino === testador && /Modo de teste ativado/.test(e.texto)), 'deveria confirmar a inscrição');
    assert.ok(enviados.some(e => e.destino === testador && e.texto === MENU_PRINCIPAL), 'deveria mandar o menu em seguida');

    enviados.length = 0;
    await tratarMensagem(criarMsg({ from: testador, body: '1', timestamp: startupTime + 11 }));
    assert.ok(enviados.some(e => e.destino === testador), 'depois do /teste ele é atendido normalmente');

    await tratarMensagem(criarMsg({ from: outro, body: 'oi' }));
    assert.equal(enviados.some(e => e.destino === outro), false, 'outro contato continua ignorado');
});

test('modo teste: "/teste sair" tira da lista e volta o silêncio; de quem não estava inscrito não gera resposta', async () => {
    config.modoTeste = true;
    const chatId = novoChatId();

    await tratarMensagem(criarMsg({ from: chatId, body: '/teste' }));
    enviados.length = 0;

    await tratarMensagem(criarMsg({ from: chatId, body: '/teste sair' }));
    assert.ok(enviados.some(e => e.destino === chatId && /desativado/.test(e.texto)));

    enviados.length = 0;
    await tratarMensagem(criarMsg({ from: chatId, body: 'oi' }));
    assert.equal(enviados.length, 0, 'depois de sair, silêncio');

    await tratarMensagem(criarMsg({ from: chatId, body: '/teste sair' }));
    assert.equal(enviados.length, 0, 'sair sem estar inscrito não responde nada');
});

test('modo teste: a inscrição vale para o mesmo contato quando ele chega como número e depois como @lid', async () => {
    config.modoTeste = true;
    const numero = '5521912345678@s.whatsapp.net';
    const lid = '128277788291105@lid';

    await tratarMensagem(criarMsg({ from: numero, aliases: [numero], body: '/teste' }));
    enviados.length = 0;

    await tratarMensagem(criarMsg({ from: lid, aliases: [lid, numero], body: 'oi', timestamp: startupTime + 11 }));
    assert.ok(enviados.some(e => e.destino === lid), 'deveria reconhecer o testador pelo número alternativo');
});

test('modo teste: a inscrição expira e o bot volta a ficar calado', async () => {
    config.modoTeste = true;
    config.testeValidadeMs = -1; // já nasce vencida
    const chatId = novoChatId();

    await tratarMensagem(criarMsg({ from: chatId, body: '/teste' }));
    enviados.length = 0;

    await tratarMensagem(criarMsg({ from: chatId, body: 'oi', timestamp: startupTime + 11 }));
    assert.equal(enviados.length, 0);
});

test('modo teste: /teste não funciona em grupo nem para quem está na blacklist', async () => {
    config.modoTeste = true;

    await tratarMensagem(criarMsg({ from: 'algumgrupo@g.us', body: '/teste' }));
    assert.equal(enviados.length, 0);
    assert.equal(testadores.testadores.size, 0);

    const bloqueado = novoChatId();
    config.blacklist = [bloqueado];
    await tratarMensagem(criarMsg({ from: bloqueado, body: '/teste' }));
    assert.equal(enviados.length, 0);
    assert.equal(testadores.testadores.size, 0);
});

test('modo teste: o NUMERO_TESTE continua sendo atendido sem precisar de /teste, e "/teste sair" não o bloqueia', async () => {
    config.modoTeste = true;
    config.numeroTeste = '5521912345678';
    const msg = criarMsg({ from: '5521912345678@s.whatsapp.net', body: 'oi' });

    await tratarMensagem(msg);
    assert.ok(enviados.some(e => e.destino === msg.from), 'atendido sem /teste');

    enviados.length = 0;
    await tratarMensagem(criarMsg({ from: msg.from, body: '/teste sair', timestamp: startupTime + 11 }));
    assert.equal(enviados.length, 0, '"/teste sair" não responde nada para quem não estava inscrito');

    estado.cooldown.clear(); // o menu tem cooldown entre respostas; aqui o que importa é o filtro do modo teste
    await tratarMensagem(criarMsg({ from: msg.from, body: 'oi', timestamp: startupTime + 12 }));
    assert.ok(enviados.some(e => e.destino === msg.from), 'segue atendido');
});

test('modo teste: um !aprovar de quem verifica publica no grupo de teste, nunca no grupo real', async () => {
    config.modoTeste = true;
    config.gruposOracao = ['grupo-real@g.us'];
    config.gruposOracaoTeste = ['grupo-teste@g.us'];
    pedidos.pedidosPendentes.set('FLX1', { nome: 'Ana', texto: 'Por cura', de: '5521911111111@c.us', criadoEm: Date.now() });

    // 5521999999999@c.us é o NUMEROS_VERIFICACAO deste arquivo de teste.
    await tratarMensagem(criarMsg({ from: '5521999999999@c.us', body: '!aprovar flx1' }));

    assert.equal(pedidos.pedidosPendentes.has('FLX1'), false);
    assert.ok(enviados.some(e => e.destino === 'grupo-teste@g.us' && /Pedido de oração/.test(e.texto)));
    assert.equal(enviados.some(e => e.destino === 'grupo-real@g.us'), false);
});

test('fora do modo teste, "/teste" é um texto qualquer: recebe o menu e não inscreve ninguém', async () => {
    config.modoTeste = false;
    const chatId = novoChatId();

    await tratarMensagem(criarMsg({ from: chatId, body: '/teste' }));
    assert.equal(enviados.some(e => /Modo de teste/.test(e.texto)), false);
    assert.ok(enviados.some(e => e.destino === chatId && e.texto === MENU_PRINCIPAL));
    assert.equal(testadores.testadores.size, 0);
});

// --- Reconhecimento e estado (refactor das mensagens) ------------------------

test('"não sei o horário da missa" depois do "posso ajudar?" responde a pergunta em vez de encerrar', async () => {
    const chatId = novoChatId();
    timers.iniciarTimers(chatId); // conversa em andamento

    await tratarMensagem(criarMsg({ from: chatId, body: 'não sei o horário da missa' }));

    assert.equal(enviados.length, 1);
    assert.match(enviados[0].texto, /Missas e confissões/);
});

test('"obrigada" encerra com a despedida e não reenvia o menu', async () => {
    const chatId = novoChatId();
    timers.iniciarTimers(chatId);

    await tratarMensagem(criarMsg({ from: chatId, body: 'Muito obrigada! 🙏' }));

    assert.deepEqual(enviados, [{ destino: chatId, texto: MSG.encerramento }]);
    assert.equal(timers.sessaoAtiva(chatId), false);
});

test('"ok" ou emoji no meio da conversa não reenviam o menu; sem conversa em andamento, "ok" recebe o menu', async () => {
    const emConversa = novoChatId();
    timers.iniciarTimers(emConversa);
    await tratarMensagem(criarMsg({ from: emConversa, body: 'ok' }));
    await tratarMensagem(criarMsg({ from: emConversa, body: '👍' }));
    assert.equal(enviados.length, 0);

    const novo = novoChatId();
    await tratarMensagem(criarMsg({ from: novo, body: 'ok' }));
    assert.deepEqual(enviados, [{ destino: novo, texto: MENU_PRINCIPAL }]);
});

test('pedido de oração: a confirmação vem numa mensagem só, sem repetir o menu', async () => {
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.ORACAO);

    await tratarMensagem(criarMsg({ from: chatId, body: 'Pela saúde do meu pai' }));

    const paraPessoa = enviados.filter(e => e.destino === chatId);
    assert.deepEqual(paraPessoa, [{ destino: chatId, texto: MSG.pedidoRecebido }]);
});

test('pedido de oração: foto pede texto e mantém o modo oração', async () => {
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.ORACAO);

    await tratarMensagem(criarMsg({ from: chatId, hasMedia: true }));

    assert.deepEqual(enviados, [{ destino: chatId, texto: MSG.pedidoSoTexto }]);
    assert.equal(estado.modoDe(chatId), MODO.ORACAO);
});

test('atendente fora do horário: a pessoa sabe que está fechado e a equipe é avisada disso', async (t) => {
    // Sábado 24/10/2026, 15h em Brasília: secretaria fechada.
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-24T18:00:00Z') });
    const msg = criarMsg({ body: '8' });

    await tratarMensagem(msg);

    assert.match(enviados.find(e => e.destino === msg.from).texto, /fechada agora/);
    assert.match(enviados.find(e => e.destino === 'grupo-humano@g.us').texto, /fora do horário/);
    assert.equal(estado.modoDe(msg.from), MODO.ATENDENTE);
});

test('atendente dentro do horário: sem aviso de fechado', async (t) => {
    // Sexta 23/10/2026, 10h em Brasília.
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T13:00:00Z') });
    const msg = criarMsg({ body: 'quero falar com um atendente' });

    await tratarMensagem(msg);

    assert.doesNotMatch(enviados.find(e => e.destino === msg.from).texto, /fechada/);
    assert.doesNotMatch(enviados.find(e => e.destino === 'grupo-humano@g.us').texto, /fora do horário/);
});

test('em atendimento, mensagens comuns ficam sem resposta (quem responde é a secretaria)', async () => {
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.ATENDENTE);

    await tratarMensagem(criarMsg({ from: chatId, body: 'qual o pix?' }));

    assert.equal(enviados.length, 0);
});

test('!manual e !auto pelo celular do Santuário pausam e religam a conversa', async () => {
    const chatId = novoChatId();

    await tratarComandoDoAparelho(criarMsg({ fromMe: true, to: chatId, body: '!manual' }));
    assert.equal(estado.modoDe(chatId), MODO.PAUSADO);
    await tratarMensagem(criarMsg({ from: chatId, body: 'oi' }));
    assert.equal(enviados.length, 0);

    await tratarComandoDoAparelho(criarMsg({ fromMe: true, to: chatId, body: '!auto' }));
    assert.equal(estado.modoDe(chatId), MODO.MENU);
    await tratarMensagem(criarMsg({ from: chatId, body: '5', timestamp: startupTime + 11 }));
    assert.match(enviados.find(e => e.destino === chatId).texto, /Doações/);
});

// --- Pedido de certidão -------------------------------------------------------

test('certidão: "certidão" pede os dados; o texto seguinte vai para o atendimento e a conversa fica com a secretaria', async () => {
    const chatId = novoChatId();

    await tratarMensagem(criarMsg({ from: chatId, body: 'certidão' }));
    assert.match(enviados.find(e => e.destino === chatId).texto, /Pedido de certidão de batismo/);
    assert.equal(estado.modoDe(chatId), MODO.CERTIDAO);

    enviados.length = 0;
    const dados = 'Maria da Silva, nasc. 01/02/1990, batizada em 1990, pais João e Ana';
    await tratarMensagem(criarMsg({ from: chatId, body: dados, timestamp: startupTime + 11 }));

    const aviso = enviados.find(e => e.destino === 'grupo-humano@g.us');
    assert.ok(aviso, 'deveria avisar o mesmo destino do atendimento humano');
    assert.match(aviso.texto, /Pedido de certidão de batismo/);
    assert.ok(aviso.texto.includes(dados));
    assert.match(enviados.find(e => e.destino === chatId).texto, /Recebemos seu pedido de certidão/);
    assert.equal(estado.modoDe(chatId), MODO.ATENDENTE);
    assert.equal(pedidos.pedidosPendentes.size, 0, 'certidão não entra na fila de oração');
});

test('certidão: sem grupo de atendimento, vai para NUMEROS_VERIFICACAO', async () => {
    config.gruposNotificacaoHumano = [];
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.CERTIDAO);

    await tratarMensagem(criarMsg({ from: chatId, body: 'José, 1985, pais X e Y' }));

    assert.ok(enviados.some(e => e.destino === '5521999999999@c.us' && /certidão/.test(e.texto)));
});

test('certidão: escrever direto "preciso da certidão de batismo" já pede os dados', async () => {
    const msg = criarMsg({ body: 'preciso da certidão de batismo do meu filho' });
    await tratarMensagem(msg);
    assert.equal(estado.modoDe(msg.from), MODO.CERTIDAO);
});

test('certidão: foto pede texto; "voltar" volta ao menu sem avisar ninguém', async () => {
    const chatId = novoChatId();
    estado.definirModo(chatId, MODO.CERTIDAO);

    await tratarMensagem(criarMsg({ from: chatId, hasMedia: true }));
    assert.deepEqual(enviados, [{ destino: chatId, texto: MSG.certidaoSoTexto }]);

    enviados.length = 0;
    await tratarMensagem(criarMsg({ from: chatId, body: 'voltar' }));
    assert.deepEqual(enviados, [{ destino: chatId, texto: MSG.voltouAoMenu }]);
    assert.equal(estado.modoDe(chatId), MODO.MENU);
});
