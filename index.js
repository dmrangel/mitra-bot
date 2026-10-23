const { config, validar } = require('./config');
const { log, erro } = require('./lib/log');

// ---------------------------------------------------------------------------
// Validação da configuração (falha cedo, com mensagem clara)
// ---------------------------------------------------------------------------

const { erros, avisos } = validar();
avisos.forEach(a => log('AVISO:', a));
if (erros.length > 0) {
    erros.forEach(e => console.error('ERRO DE CONFIGURAÇÃO:', e));
    console.error('\nCorrija o arquivo .env (use o .env.example como modelo) e rode de novo.');
    process.exit(1);
}

const cliente = require('./lib/cliente');
const { AVISO_LIGACAO } = require('./lib/textos');
const { enviar } = require('./lib/envio');
const { adaptarMensagem } = require('./lib/mensagem');
const { limparMapasAuxiliares } = require('./lib/estado');
const { carregarPedidos, salvarPedidos, limparPedidosExpirados } = require('./lib/pedidos');
const testadores = require('./lib/testadores');
const { tratarMensagem, tratarComandoDoAparelho } = require('./lib/fluxoConversa');

carregarPedidos();
testadores.carregar();
setInterval(() => {
    limparPedidosExpirados();
    limparMapasAuxiliares();
    testadores.limparExpirados();
}, 60 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Eventos do WhatsApp
// ---------------------------------------------------------------------------

async function tratarRecebida(bruta) {
    try {
        const msg = await adaptarMensagem(bruta, { pnDoLid: cliente.pnDoLid });
        if (!msg) return;
        // Mensagens com fromMe vêm do celular do Santuário (o bot não recebe
        // as próprias: emitOwnEvents está desligado em lib/cliente.js).
        if (msg.fromMe) await tratarComandoDoAparelho(msg);
        else await tratarMensagem(msg);
    } catch (e) {
        erro('tratar mensagem', e);
    }
}

function aoReceber(mensagens, tipo) {
    // "notify" = chegou agora; "append" = chegou enquanto a conexão caiu por
    // um instante. O histórico antigo também vem como "append", mas é
    // descartado pelo filtro de horário (startupTime) no fluxo da conversa.
    if (tipo !== 'notify' && tipo !== 'append') return;
    for (const m of mensagens) tratarRecebida(m);
}

function aoLigar(chamadas) {
    for (const c of chamadas) {
        if (c.status !== 'offer' || c.isGroup) continue;
        // No modo teste, as ligações de quem não está testando passam direto:
        // o bot não rejeita a chamada nem manda o aviso (importante quando o bot
        // roda num número que também é usado por uma pessoa).
        if (!testadores.podeResponder(c.from, c.callerPn)) continue;
        cliente.rejeitarLigacao(c.id, c.from)
            .catch(e => erro('rejeitar chamada', e))
            .then(() => enviar(c.callerPn || c.from, AVISO_LIGACAO));
    }
}

function aoDeslogar() {
    salvarPedidos();
    process.exit(cliente.SAIDA_DESLOGADO);
}

// ---------------------------------------------------------------------------
// Encerramento e erros não tratados
// ---------------------------------------------------------------------------

let encerrando = false;
function encerrar(sinal) {
    if (encerrando) return;
    encerrando = true;
    log(`Recebido ${sinal}. Encerrando...`);
    salvarPedidos();
    cliente.encerrar();
    // Dá um instante para o creds.update pendente chegar ao disco.
    setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

process.on('unhandledRejection', motivo => erro('promise não tratada', motivo));
process.on('uncaughtException', e => {
    erro('exceção não tratada', e);
    salvarPedidos();
    process.exit(1);
});

// ---------------------------------------------------------------------------

log(`Iniciando. Sessão em ${config.pastaAuth}.`);
cliente.conectar({ aoReceber, aoLigar, aoDeslogar }).catch(e => {
    erro('inicialização', e);
    process.exit(1);
});
