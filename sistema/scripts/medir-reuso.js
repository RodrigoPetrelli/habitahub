// Compactação por reuso (técnica 2): mede quantas linhas os componentes
// genéricos economizam.
//
//   npm run medir-reuso
//
// Para cada componente genérico, compara:
//   com reuso  = linhas do componente (uma vez) + linhas específicas de cada uso
//   sem reuso  = linhas do componente copiadas em cada uso + linhas específicas
// O "sem reuso" é uma estimativa: supõe que cada uso teria a própria cópia
// da lógica genérica. Conta só linhas de código (sem linhas vazias e comentários).
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');

function linhasDeCodigo(arquivo) {
  let emBloco = false;
  return fs.readFileSync(path.join(raiz, arquivo), 'utf8').split('\n').filter((linha) => {
    const t = linha.trim();
    if (emBloco) { if (t.includes('*/')) emBloco = false; return false; }
    if (t.startsWith('/*')) { emBloco = !t.includes('*/'); return false; }
    return t !== '' && !t.startsWith('//') && !t.startsWith('--');
  }).length;
}

const pasta = (dir, filtro = () => true) => fs.readdirSync(path.join(raiz, dir))
  .filter((f) => f.endsWith('.js') && filtro(f)).map((f) => `${dir}/${f}`);

// Componente genérico → arquivos que o reutilizam.
const componentes = [
  {
    nome: 'TelaCrud (6 telas de CRUD)',
    generico: ['public/js/TelaCrud.js'],
    usos: pasta('public/js/telas'),
  },
  {
    nome: 'CrudControlador (rotas REST dos 6 cadastros)',
    generico: ['src/http/CrudControlador.js'],
    usos: null, // 6 usos de uma linha cada, em src/app.js
    quantidadeUsos: 6,
    linhasPorUso: 1,
  },
  {
    nome: 'Repositorio – Template Method (7 repositórios)',
    generico: ['src/repositorios/Repositorio.js'],
    usos: pasta('src/repositorios', (f) => f !== 'Repositorio.js'),
  },
  {
    nome: 'Validador – Template Method (6 validadores)',
    generico: ['src/validacao/Validador.js'],
    usos: ['src/validacao/validadores.js'],
    quantidadeUsos: 6,
  },
  {
    nome: 'Relatorio – Template Method (3 relatórios)',
    generico: ['src/relatorios/Relatorio.js'],
    usos: ['src/relatorios/relatorios.js'],
    quantidadeUsos: 3,
  },
];

const soma = (arquivos) => arquivos.reduce((s, f) => s + linhasDeCodigo(f), 0);

let totalCom = 0;
let totalSem = 0;
console.log('\nCompactação por reuso – linhas de código\n');
console.log('| Componente genérico | Linhas do genérico | Usos | Linhas específicas | Sem reuso (estimado) | Com reuso | Economia |');
console.log('|---|---|---|---|---|---|---|');
for (const c of componentes) {
  const generico = soma(c.generico);
  const usos = c.quantidadeUsos ?? c.usos.length;
  const especificas = c.usos ? soma(c.usos) : usos * c.linhasPorUso;
  const com = generico + especificas;
  const sem = generico * usos + especificas;
  totalCom += com;
  totalSem += sem;
  console.log(`| ${c.nome} | ${generico} | ${usos} | ${especificas} | ${sem} | ${com} | ${sem - com} linhas (${Math.round((1 - com / sem) * 100)}%) |`);
}
console.log(`| **Total** | | | | **${totalSem}** | **${totalCom}** | **${totalSem - totalCom} linhas (${Math.round((1 - totalCom / totalSem) * 100)}%)** |\n`);
