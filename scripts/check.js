// Confere a sintaxe de todos os .js do projeto (node --check em cada um).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pastas = ['.', 'lib', 'scripts', 'test'];
const arquivos = pastas.flatMap(p =>
    fs.readdirSync(path.join(raiz, p))
        .filter(f => /\.c?js$/.test(f))
        .map(f => path.join(p, f))
);

for (const f of arquivos) {
    execFileSync(process.execPath, ['--check', path.join(raiz, f)], { stdio: 'inherit' });
}
console.log(`Sintaxe OK em ${arquivos.length} arquivos.`);
