// Compactação do front-end (técnica 1: minificação + empacotamento com esbuild).
//
//   npm run build   →  gera dist/ e imprime o tamanho antes e depois
//
// Saídas:
//   dist/js/app.min.js          aplicação inteira: 9 módulos ES viram 1 arquivo minificado
//   dist/css/app.min.css        folha de estilos minificada
//   dist/index.html             página apontando para os arquivos compactados
//   dist/lib/tela-crud.min.js   componente reutilizável (TelaCrud + utilitários) em um
//                               único arquivo, pronto para ser usado por outro produto da linha
//
// O servidor usa dist/ quando HABITAHUB_FRONT=dist (é o que o Docker faz).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const esbuild = require('esbuild');

const raiz = path.join(__dirname, '..');
const publico = path.join(raiz, 'public');
const dist = path.join(raiz, 'dist');
const comum = { bundle: true, minify: true, legalComments: 'none', target: 'es2022', logLevel: 'warning' };

const arquivosDe = (pasta, ext) => fs.readdirSync(pasta, { recursive: true })
  .filter((f) => f.endsWith(ext)).map((f) => path.join(pasta, f));
const tamanho = (arquivos) => arquivos.reduce((s, f) => s + fs.statSync(f).size, 0);
const gzip = (arquivos) => arquivos.reduce((s, f) => s + zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length, 0);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

async function main() {
  fs.rmSync(dist, { recursive: true, force: true });

  await esbuild.build({ ...comum, entryPoints: [path.join(publico, 'js', 'app.js')], format: 'esm', outfile: path.join(dist, 'js', 'app.min.js') });
  await esbuild.build({ ...comum, entryPoints: [path.join(publico, 'css', 'app.css')], outfile: path.join(dist, 'css', 'app.min.css') });
  await esbuild.build({ ...comum, entryPoints: [path.join(publico, 'js', 'biblioteca.js')], format: 'esm', outfile: path.join(dist, 'lib', 'tela-crud.min.js') });

  const html = fs.readFileSync(path.join(publico, 'index.html'), 'utf8')
    .replace('/css/app.css', '/css/app.min.css')
    .replace('/js/app.js', '/js/app.min.js')
    .replace(/\n\s*/g, '');
  fs.writeFileSync(path.join(dist, 'index.html'), html);

  // Biblioteca: só o componente reutilizável e o que ele usa.
  const fontesBiblioteca = ['TelaCrud.js', 'util.js'].map((f) => path.join(publico, 'js', f));

  const linhas = [
    ['JavaScript da aplicação', arquivosDe(path.join(publico, 'js'), '.js').filter((f) => !f.endsWith('biblioteca.js')), [path.join(dist, 'js', 'app.min.js')]],
    ['CSS', arquivosDe(path.join(publico, 'css'), '.css'), [path.join(dist, 'css', 'app.min.css')]],
    ['HTML', [path.join(publico, 'index.html')], [path.join(dist, 'index.html')]],
    ['Biblioteca TelaCrud', fontesBiblioteca, [path.join(dist, 'lib', 'tela-crud.min.js')]],
  ];

  console.log('\nCompactação do front-end (esbuild)\n');
  console.log('| Parte | Arquivos antes → depois | Antes | Depois | Redução | gzip antes | gzip depois |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [nome, antes, depois] of linhas) {
    const a = tamanho(antes);
    const d = tamanho(depois);
    console.log(`| ${nome} | ${antes.length} → ${depois.length} | ${kb(a)} | ${kb(d)} | ${Math.round((1 - d / a) * 100)}% | ${kb(gzip(antes))} | ${kb(gzip(depois))} |`);
  }
  console.log('\nSaída em dist/. Para servir a versão compactada: HABITAHUB_FRONT=dist npm start\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
