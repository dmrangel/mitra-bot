// ===========================================================================
// Tudo o que o bot escreve, num lugar só.
//
// - DADOS: telefones, horário da secretaria, PIX... Cada informação aparece
//   uma única vez aqui e é reaproveitada nos textos. Mudou um telefone? Mude
//   só em DADOS.
// - OPCOES: o menu. O texto do menu principal é montado a partir desta lista,
//   então criar, renomear ou reordenar uma opção é mexer só aqui.
// - MSG: as outras mensagens (fluxo da conversa, avisos para a equipe).
//
// Este repositório é público: aqui só entra informação que já é pública.
// Formatação do WhatsApp: *negrito*, _itálico_.
// ===========================================================================

const DADOS = {
    nome: 'Santuário de Santa Rita',
    telefones: ['(21) 2253-7564', '(21) 97908-2767'],
    endereco: 'Largo de Santa Rita, s/nº, Centro, Rio de Janeiro (RJ)',
    pix: '21974797064',

    // Horário de funcionamento da secretaria (fuso de Brasília). Usado no texto
    // da opção 6 e para saber se há alguém para atender a opção 8.
    // dias: 0 = domingo, 1 = segunda ... 6 = sábado. Horas no formato HH:MM.
    horarioSecretaria: [
        { rotulo: 'Segunda a sexta', dias: [1, 2, 3, 4, 5], abre: '06:30', fecha: '18:30' },
        { rotulo: 'Sábado', dias: [6], abre: '08:00', fecha: '12:00' },
        { rotulo: 'Domingo', dias: [0], abre: '06:30', fecha: '12:00' }
    ]
};

// --- Pedacinhos reaproveitados ----------------------------------------------

/** '06:30' -> '6h30', '08:00' -> '8h' */
function hora(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

const TELEFONES = `📞 ${DADOS.telefones.join(' · ')}`;
const HORARIO_SECRETARIA = DADOS.horarioSecretaria
    .map(f => `• ${f.rotulo}: ${hora(f.abre)} às ${hora(f.fecha)}`)
    .join('\n');
const VOLTAR = 'Para voltar ao menu, envie *voltar*.';

// --- Menu -----------------------------------------------------------------
//
// id:        o número que a pessoa digita
// titulo:    como a opção aparece no menu principal
// palavras:  palavras ou expressões que levam a esta opção (sem acento, minúsculas
//            ou não, tanto faz). Evite palavras comuns em conversa ("hora",
//            "valor", "pessoa", "ajuda"): elas fazem o bot responder o que
//            ninguém perguntou.
// resposta:  o texto enviado. Pode ser uma função que recebe
//            { secretariaAberta } quando o texto depende do horário.
// acao:      'oracao' (o próximo texto vira pedido de oração) ou
//            'atendente' (pausa o bot e avisa a equipe). Sem acao = só responde.

const OPCOES = [
    {
        id: '1',
        titulo: 'Missas e confissões',
        palavras: [
            'missa', 'missas', 'confissao', 'confissoes', 'confessar', 'horario de missa',
            'horarios de missa', 'horario da missa', 'intencao', 'intencoes', 'marcar missa',
            'marcacao', 'marcacoes', 'falecido', 'falecidos', 'setimo dia', 'acao de gracas',
            'missa de cura', 'eucaristia', 'comunhao', 'celebracao'
        ],
        resposta: `🕰️ *Missas e confissões*

*Missas*
• Segunda: 7h, 8h, 9h, 10h, 12h15, 15h30 e 18h
• Terça a sexta: 7h, 8h, 9h, 10h, 12h15 e 18h
• Sábado: 8h, 9h e 10h
• Domingo: 7h30, 9h e 10h30

*Confissões*
• Segunda: 16h às 18h
• Quarta e sexta: 10h30 às 12h

*Intenções de missa*
• Missa individual: R$ 150 (vários dias e horários)
• Comunitária pelos falecidos: segunda, às 15h30 e às 18h (R$ 5 por intenção)
• Comunitária em ação de graças: quinta, às 18h (R$ 5 por intenção)

As intenções são marcadas só por telefone, com a secretaria, ou pessoalmente.
${TELEFONES}`
    },
    {
        id: '2',
        titulo: 'Pedido de oração',
        palavras: [
            'oracao', 'oracoes', 'pedido de oracao', 'rezar', 'rezem', 'reze', 'orar',
            'orem', 'prece', 'preces', 'intercessao', 'interceder'
        ],
        resposta: `🙏 *Pedido de oração*

Escreva seu pedido numa mensagem de texto e envie. Nossa equipe vai rezar pela sua intenção.

${VOLTAR}`,
        acao: 'oracao'
    },
    {
        id: '3',
        titulo: 'Batismo e certidões',
        palavras: [
            'batismo', 'batismos', 'batizado', 'batizar', 'batizados', 'certidao',
            'certidoes', 'certidao de batismo', 'padrinho', 'padrinhos', 'madrinha',
            'madrinhas', 'curia', 'bebe', 'nenem'
        ],
        resposta: `💧 *Batismo e certidões*

*Certidão de batismo* (batizados a partir de 1901)
Para pedir, informe: nome completo, data de nascimento, data ou ano do batismo e nome dos pais.
• Taxa: R$ 15, pelo PIX ${DADOS.pix}
• Prazo: 7 dias. Ligue antes para confirmar.

Batizados antes de 1901: procure o arquivo da Cúria
📞 2240-2869 · ✉️ arquivodacuriarj@arqrio.org.br

*Batismo de crianças* (até 6 anos)
• Batizado: último sábado do mês, às 11h
• Reunião de pais e padrinhos: 1º sábado do mês, das 11h às 12h
• Padrinhos: batizados e, se morarem juntos, casados
• Documentos: cópia da certidão de nascimento, comprovante de residência dos pais, identidade dos padrinhos e autorização da paróquia de origem
• Agendamento: pessoalmente, na secretaria
• Valor: R$ 50 (vela e certificado)

Dúvidas: ${TELEFONES}`
    },
    {
        id: '4',
        titulo: 'Casamentos',
        palavras: [
            'casamento', 'casamentos', 'casar', 'matrimonio', 'noiva', 'noivo', 'noivos',
            'cerimonia', 'tapete', 'iluminacao', 'celebrante'
        ],
        resposta: `💍 *Casamentos*

• Valor da cerimônia: R$ 3.500,00, já incluídos tapete, iluminação e celebrante
• Capacidade: 150 pessoas sentadas
• Horário: somente aos sábados, às 17h

Informações e agendamento com a secretaria:
${TELEFONES}`
    },
    {
        id: '5',
        titulo: 'Doações e PIX',
        palavras: [
            'doacao', 'doacoes', 'doar', 'pix', 'chave pix', 'dizimo', 'dizimos', 'oferta',
            'ofertas', 'ofertorio', 'contribuir', 'contribuicao', 'dados bancarios',
            'conta bancaria', 'deposito', 'cnpj', 'bradesco'
        ],
        resposta: `🙏 *Doações e dízimo*

*PIX:* ${DADOS.pix}

*Transferência*
Bradesco · Agência 0436 · Conta poupança 6682220-6
Mitra Arquiepiscopal
CNPJ 33.593.575/0222-74`
    },
    {
        id: '6',
        titulo: 'Secretaria e endereço',
        palavras: [
            'secretaria', 'endereco', 'localizacao', 'onde fica', 'como chegar', 'mapa', 'cep',
            'telefone', 'telefones', 'contato', 'contatos', 'ligar', 'funcionamento',
            'expediente', 'horario da secretaria', 'que horas abre', 'que horas fecha'
        ],
        resposta: `📍 *Secretaria e endereço*

*Funcionamento*
${HORARIO_SECRETARIA}

${TELEFONES}
📍 ${DADOS.endereco}`
    },
    {
        id: '7',
        titulo: 'Comunidade e redes sociais',
        palavras: [
            'redes sociais', 'rede social', 'instagram', 'insta', 'facebook', 'youtube',
            'comunidade', 'grupo do whatsapp', 'comunidade do whatsapp'
        ],
        resposta: `📱 *Comunidade e redes sociais*

Participe da nossa comunidade no WhatsApp:
https://chat.whatsapp.com/I4pJywPvsR1A0Zue6i03tf

• Instagram: https://www.instagram.com/santuarioarquidiocesanodesantarita/
• Facebook: https://www.facebook.com/santuarioarquidiocesanodesantarita
• YouTube: https://www.youtube.com/channel/UCplLFwYdOcN7AbCLVh_SGcg`
    },
    {
        id: '8',
        titulo: 'Falar com um atendente',
        palavras: [
            'atendente', 'atendimento', 'atendimento humano', 'humano', 'secretario',
            'falar com a secretaria', 'falar com alguem', 'falar com uma pessoa',
            'falar com o padre'
        ],
        resposta: ({ secretariaAberta }) => (secretariaAberta
            ? `👤 *Falar com um atendente*

Já avisamos nossa equipe. Um secretário vai responder por aqui assim que possível.

Enquanto isso, as respostas automáticas ficam pausadas nesta conversa. ${VOLTAR}`
            : `👤 *Falar com um atendente*

Nossa secretaria está fechada agora. O horário de funcionamento é:
${HORARIO_SECRETARIA}

Sua conversa ficou registrada e um secretário vai responder por aqui quando reabrirmos. Se quiser, já pode escrever o que precisa.

${VOLTAR}`),
        acao: 'atendente'
    }
];

const MENU_PRINCIPAL = `Olá! Seja bem-vindo(a) ao atendimento do *${DADOS.nome}*. 🌹

Responda com o *número* do assunto:

${OPCOES.map(o => `*${o.id}* · ${o.titulo}`).join('\n')}

_Este número não recebe ligações._`;

// --- Mensagens do fluxo ---------------------------------------------------

const MSG = {
    menu: MENU_PRINCIPAL,

    voltouAoMenu: `Certo, as respostas automáticas estão de volta.\n\n${MENU_PRINCIPAL}`,

    soTexto: 'Este atendimento automático só consegue ler mensagens de texto. Por favor, escreva sua dúvida ou responda com o número de uma opção do menu.',

    // Depois de TEMPO_AVISO_MIN sem resposta.
    algoMais: 'Posso ajudar com mais alguma coisa? Responda com o número de uma opção, ou envie *não* para encerrar.',
    encerramento: 'Agradecemos o contato! Que, pela intercessão de Santa Rita, Deus abençoe você e sua família. 🌹',

    // Pedido de oração
    pedidoSoTexto: `Para encaminhar seu pedido, ele precisa ser escrito em texto. 🙏\n\n${VOLTAR}`,
    pedidoRepetido: `Acabamos de receber um pedido seu e ele já está com a nossa equipe. 🙏 Aguarde alguns segundos antes de enviar outro.\n\n${VOLTAR}`,
    pedidoRecebido: 'Recebemos seu pedido de oração. 🙏 Nossa equipe vai rezar pela sua intenção.\n\nSe precisar de mais alguma coisa, envie *menu*.',

    avisoLigacao: `📵 *Este número não recebe ligações.*

Para falar com a secretaria por telefone:
${TELEFONES}

Por mensagem, é só escrever aqui.`,

    // --- Para a equipe (NUMEROS_VERIFICACAO e grupos) ---------------------
    equipe: {
        novoPedido: ({ nome, link, texto, id }) => `📥 *Novo pedido de oração para aprovar*

*De:* ${nome}
*WhatsApp:* ${link}

*Pedido:*
${texto}

Para publicar no grupo de oração, responda:
!aprovar ${id}`,

        pedidoPublicado: ({ nome, texto }) => `🙏 *Pedido de oração*

*De:* ${nome}

${texto}`,

        atendimento: ({ nome, link, secretariaAberta }) => `⚠️ *Pedido de atendimento*

*Nome:* ${nome}
*WhatsApp:* ${link}
${secretariaAberta ? '' : '\n_Chegou fora do horário da secretaria._\n'}
A pessoa está aguardando um secretário. As respostas automáticas ficam pausadas na conversa dela por algumas horas; para religar antes, envie *!auto* na conversa.`,

        semPedidos: 'Nenhum pedido aguardando aprovação.',
        listaPedidos: pedidos => `📋 *Pedidos aguardando aprovação*\n\n${pedidos
            .map(p => `*${p.id}* · ${p.nome}\n${p.resumo}`)
            .join('\n\n')}\n\nPara aprovar: !aprovar <ID>`,
        usoAprovar: 'Use: !aprovar <ID>. Envie !pedidos para ver os IDs pendentes.',
        pedidoNaoEncontrado: '❌ Pedido não encontrado (ou já aprovado).',
        falhaPublicar: '⚠️ Não consegui publicar no grupo de oração. O pedido continua pendente; tente de novo em instantes.',
        aprovado: modoTeste => (modoTeste
            ? '✅ Pedido aprovado e publicado no grupo de *TESTE* (modo teste).'
            : '✅ Pedido aprovado e publicado no grupo de oração.')
    },

    // --- Modo teste --------------------------------------------------------
    testeAtivado: horas => `✅ *Modo de teste ativado para você.*\n\nA partir de agora respondo às suas mensagens como respondo ao público (vale por ${horas} h). Para sair, envie */teste sair*.`,
    testeDesativado: 'Modo de teste desativado para você. Para voltar, envie */teste*.'
};

module.exports = { DADOS, OPCOES, MSG };
