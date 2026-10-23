const { config } = require('../config');

const MENU_PRINCIPAL = `Olá! O Santuário de Santa Rita agradece seu contato 🌹🙏🏻\n\nNão atendemos ligações neste número. Digite a opção desejada:\n\n1 - Missas e Confissões\n2 - Pedidos de Oração\n3 - Batismo e Certidões\n4 - Casamentos\n5 - Doações e PIX\n6 - Secretaria e Localização\n7 - Comunidade e Redes Sociais\n8 - Atendimento Humano`;

const AVISO_LIGACAO = `⚠️ *AVISO SOBRE LIGAÇÕES*\n\nEste número de WhatsApp não recebe chamadas. Para falar conosco por telefone, ligue para:\n\n${config.telefones.map(t => `📞 ${t}`).join('\n')}`;

// Modo teste (MODO_TESTE=true): respostas a "/teste" e "/teste sair".
const TESTE_ATIVADO = () => {
    const horas = Math.max(1, Math.round(config.testeValidadeMs / (60 * 60 * 1000)));
    return `✅ *Modo de teste ativado para você.*\n\nA partir de agora respondo às suas mensagens como respondo ao público (vale por ${horas} h). Para sair, envie */teste sair*.`;
};
const TESTE_DESATIVADO = 'Modo de teste desativado para você. Para voltar, envie */teste*.';

module.exports = { MENU_PRINCIPAL, AVISO_LIGACAO, TESTE_ATIVADO, TESTE_DESATIVADO };
