const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const Configuracao = require('./infra/Configuracao');
const Database = require('./infra/Database');
const { ErroAplicacao, ErroValidacao } = require('./infra/erros');
const { popularSeVazio } = require('./infra/seed');
const Roteador = require('./http/Roteador');
const CrudControlador = require('./http/CrudControlador');
const CorretorRepositorio = require('./repositorios/CorretorRepositorio');
const ProprietarioRepositorio = require('./repositorios/ProprietarioRepositorio');
const ClienteRepositorio = require('./repositorios/ClienteRepositorio');
const ImovelRepositorio = require('./repositorios/ImovelRepositorio');
const VisitaRepositorio = require('./repositorios/VisitaRepositorio');
const PropostaRepositorio = require('./repositorios/PropostaRepositorio');
const NotificacaoRepositorio = require('./repositorios/NotificacaoRepositorio');
const { RelatorioImoveis, RelatorioVisitas, RelatorioPropostas } = require('./relatorios/relatorios');
const { exportadorPara } = require('./estrategias/exportacao');

const PUBLICO = path.join(__dirname, '..', 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// Monta as rotas de acordo com as features do produto ativo. É aqui que a
// variabilidade aparece no back-end: um módulo desligado nem ganha rotas.
function montarRotas() {
  const config = Configuracao.instancia();
  const roteador = new Roteador();

  const recursos = {
    corretores: CorretorRepositorio,
    proprietarios: ProprietarioRepositorio,
    clientes: ClienteRepositorio,
    imoveis: ImovelRepositorio,
  };
  const relatorios = { imoveis: RelatorioImoveis };

  // Ponto de variação VP1 – feature opcional "visitas"
  if (config.temFeature('visitas')) {
    recursos.visitas = VisitaRepositorio;
    relatorios.visitas = RelatorioVisitas;
  }
  // Ponto de variação VP2 – feature opcional "propostas"
  if (config.temFeature('propostas')) {
    recursos.propostas = PropostaRepositorio;
    relatorios.propostas = RelatorioPropostas;
  }

  for (const [recurso, Repo] of Object.entries(recursos)) {
    new CrudControlador(new Repo()).registrar(roteador, recurso);
  }

  roteador.get('/api/produto', () => ({ status: 200, corpo: config.paraCliente() }));
  roteador.get('/api/notificacoes', () => ({ status: 200, corpo: new NotificacaoRepositorio().listar() }));

  // Ponto de variação VP4 – formatos de exportação (Strategy)
  roteador.get('/api/relatorios/:tipo', (req, p) => {
    const Relatorio = relatorios[p.tipo];
    if (!Relatorio) return { status: 404, corpo: { mensagem: 'Relatório indisponível neste produto.' } };
    const formato = req.consulta.get('formato') || 'csv';
    const exportador = exportadorPara(formato);
    if (!exportador) return { status: 400, corpo: { mensagem: `O formato "${formato}" não está habilitado neste produto.` } };
    const conteudo = new Relatorio().gerar(exportador, { status: req.consulta.get('status') || '' });
    return { status: 200, bruto: conteudo, tipo: exportador.tipoConteudo };
  });

  return roteador;
}

// Erros do SQLite viram mensagens que a tela consegue mostrar.
function traduzirErroBanco(e) {
  const unico = /UNIQUE constraint failed: \w+\.(\w+)/.exec(e.message);
  if (unico) return new ErroValidacao({ [unico[1]]: 'Já existe um cadastro com este valor.' });
  if (/FOREIGN KEY constraint failed/.test(e.message)) return new ErroAplicacao('O registro está ligado a outros cadastros.', 409);
  return null;
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let texto = '';
    req.on('data', (parte) => {
      texto += parte;
      if (texto.length > 1e6) reject(new ErroAplicacao('Requisição muito grande.', 413));
    });
    req.on('end', () => {
      try { resolve(texto ? JSON.parse(texto) : {}); } catch { reject(new ErroAplicacao('JSON inválido.', 400)); }
    });
    req.on('error', reject);
  });
}

function servirArquivo(caminho, res) {
  const relativo = caminho === '/' ? 'index.html' : caminho.slice(1);
  const arquivo = path.normalize(path.join(PUBLICO, relativo));
  if (!arquivo.startsWith(PUBLICO) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
  fs.createReadStream(arquivo).pipe(res);
}

function criarAplicacao({ produto, banco }) {
  Configuracao.instancia().carregar(produto);
  const db = Database.instancia().conectar(banco);
  db.executar(fs.readFileSync(path.join(__dirname, 'infra', 'schema.sql'), 'utf8'));
  popularSeVazio();

  const roteador = montarRotas();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      servirArquivo(decodeURIComponent(url.pathname), res);
      return;
    }

    const enviarJson = (status, corpo) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
    };

    const rota = roteador.encontrar(req.method, url.pathname);
    if (!rota) { enviarJson(404, { mensagem: 'Rota não encontrada neste produto.' }); return; }

    try {
      req.corpo = ['POST', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
      req.consulta = url.searchParams;
      const r = rota.handler(req, rota.params);
      if (r.bruto !== undefined) {
        res.writeHead(r.status, { 'Content-Type': r.tipo });
        res.end(r.bruto);
      } else {
        enviarJson(r.status, r.corpo);
      }
    } catch (e) {
      const erro = e instanceof ErroAplicacao ? e : traduzirErroBanco(e);
      if (erro) {
        enviarJson(erro.status, { mensagem: erro.message, erros: erro.erros });
      } else {
        console.error(e);
        enviarJson(500, { mensagem: 'Erro interno.' });
      }
    }
  });
}

module.exports = { criarAplicacao };
