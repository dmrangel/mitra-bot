// Configuração do pm2. Use:  pm2 start ecosystem.config.cjs
module.exports = {
    apps: [{
        name: 'mitra-bot',
        script: 'index.js',
        cwd: __dirname,
        // A VM é pequena (1 GB para três bots): o heap do Node fica limitado e
        // o pm2 reinicia o bot se ele passar do teto, antes de afetar os outros.
        node_args: '--max-old-space-size=160',
        max_memory_restart: '220M',
        autorestart: true,
        min_uptime: '30s',
        max_restarts: 10,
        exp_backoff_restart_delay: 1000,
        // 78 = o WhatsApp desconectou o aparelho (ver lib/cliente.js). Reiniciar
        // não adianta: é preciso parear de novo, à mão.
        stop_exit_codes: [78],
        time: true
    }]
};
