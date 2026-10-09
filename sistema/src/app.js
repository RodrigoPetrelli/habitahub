const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const Configuracao = require('./infra/Configuracao');
const Database = require('./infra/Database');
const { ErroAplicacao, ErroValidacao } = require('./infra/erros');
const { popularSeVazio, garantirAcessoDeDemonstracao } = require('./infra/seed');
const { Autenticacao, DURACAO_SESSAO } = require('./seguranca/Autenticacao');
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

// Front-end servido: public/ (código-fonte) ou dist/ (compactado por npm run build).
let PUBLICO = path.join(__dirname, '..', 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// Rotas abertas sem login. Todas as outras rotas /api/ exigem sessão.
const ROTAS_PUBLICAS = new Set(['POST /api/login', 'POST /api/logout', 'GET /api/sessao', 'GET /api/produto', 'POST /api/cadastro']);

// "Criar conta" é aberta: no máximo 5 contas por IP a cada hora.
const LIMITE_CADASTROS = 5;
const JANELA_CADASTROS = 60 * 60 * 1000;
const cadastrosPorIp = new Map(); // ip → [instantes dos cadastros]

// Barra o IP que já criou contas demais; devolve a função que registra o cadastro feito.
function verificarLimiteDeCadastros(req) {
  const ip = req.socket.remoteAddress;
  const agora = Date.now();
  const recentes = (cadastrosPorIp.get(ip) || []).filter((t) => agora - t < JANELA_CADASTROS);
  cadastrosPorIp.set(ip, recentes);
  if (recentes.length >= LIMITE_CADASTROS) throw new ErroAplicacao('Muitos cadastros feitos daqui. Tente de novo mais tarde.', 429);
  return () => recentes.push(agora);
}

// Cookie de sessão. O nome leva o produto porque os dois produtos rodam no mesmo
// host (localhost) e cookies não separam portas.
const nomeDoCookie = () => `hh_sessao_${Configuracao.instancia().produto.id}`;

function tokenDoCookie(req) {
  const nome = nomeDoCookie();
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [chave, ...valor] = parte.trim().split('=');
    if (chave === nome) return valor.join('=');
  }
  return null;
}

function cookieDeSessao(req, token, duracaoMs) {
  const https = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return `${nomeDoCookie()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(duracaoMs / 1000)}${https ? '; Secure' : ''}`;
}

function rotasDeAcesso(roteador, autenticacao) {
  roteador.post('/api/login', async (req) => {
    const { token, usuario } = await autenticacao.entrar(req.corpo.email, req.corpo.senha);
    return { status: 200, corpo: usuario, cabecalhos: { 'Set-Cookie': cookieDeSessao(req, token, DURACAO_SESSAO) } };
  });
  roteador.post('/api/logout', (req) => {
    autenticacao.sair(tokenDoCookie(req));
    return { status: 204, cabecalhos: { 'Set-Cookie': cookieDeSessao(req, '', 0) } };
  });
  roteador.post('/api/cadastro', async (req) => {
    const registrar = verificarLimiteDeCadastros(req);
    const novo = await new CorretorRepositorio().criarConta(req.corpo);
    registrar();
    return { status: 201, corpo: { nome: novo.nome, email: novo.email } };
  });
  roteador.get('/api/sessao', async (req) => {
    const usuario = await autenticacao.usuarioDoToken(tokenDoCookie(req));
    return usuario ? { status: 200, corpo: usuario } : { status: 401, corpo: { mensagem: 'Sem sessão.' } };
  });
}

// Monta as rotas de acordo com as features do produto ativo. É aqui que a
// variabilidade aparece no back-end: um módulo desligado nem ganha rotas.
function montarRotas(autenticacao) {
  const config = Configuracao.instancia();
  const roteador = new Roteador();
  rotasDeAcesso(roteador, autenticacao);

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
  roteador.get('/api/notificacoes', async () => ({ status: 200, corpo: await new NotificacaoRepositorio().listar() }));

  // Ponto de variação VP4 – formatos de exportação (Strategy)
  roteador.get('/api/relatorios/:tipo', async (req, p) => {
    const Relatorio = relatorios[p.tipo];
    if (!Relatorio) return { status: 404, corpo: { mensagem: 'Relatório indisponível neste produto.' } };
    const formato = req.consulta.get('formato') || 'csv';
    const exportador = exportadorPara(formato);
    if (!exportador) return { status: 400, corpo: { mensagem: `O formato "${formato}" não está habilitado neste produto.` } };
    const conteudo = await new Relatorio().gerar(exportador, { status: req.consulta.get('status') || '' });
    return { status: 200, bruto: conteudo, tipo: exportador.tipoConteudo };
  });

  return roteador;
}

// Erros do banco (SQLite ou PostgreSQL) viram mensagens que a tela consegue mostrar.
function traduzirErroBanco(e) {
  const unicoSqlite = /UNIQUE constraint failed: \w+\.(\w+)/.exec(e.message);
  const unicoPostgres = e.code === '23505' && /Key \((\w+)\)/.exec(e.detail || '');
  const campo = (unicoSqlite || unicoPostgres || [])[1];
  if (campo) return new ErroValidacao({ [campo]: 'Já existe um cadastro com este valor.' });
  if (/FOREIGN KEY constraint failed/.test(e.message) || e.code === '23503') {
    return new ErroAplicacao('O registro está ligado a outros cadastros.', 409);
  }
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

async function criarAplicacao({ produto, banco, front = 'public' }) {
  PUBLICO = path.join(__dirname, '..', front === 'dist' ? 'dist' : 'public');
  if (!fs.existsSync(path.join(PUBLICO, 'index.html'))) {
    throw new Error(`Front-end "${front}" não encontrado. Rode "npm run build" antes.`);
  }
  Configuracao.instancia().carregar(produto);
  await Database.instancia().conectar(banco);
  await popularSeVazio();
  await garantirAcessoDeDemonstracao();

  const autenticacao = new Autenticacao();
  const roteador = montarRotas(autenticacao);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      servirArquivo(decodeURIComponent(url.pathname), res);
      return;
    }

    const enviarJson = (status, corpo, cabecalhos = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabecalhos });
      res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
    };

    try {
      // Sem sessão válida, nenhuma rota protegida responde (nem revela se existe).
      if (!ROTAS_PUBLICAS.has(`${req.method} ${url.pathname}`)) {
        req.usuario = await autenticacao.usuarioDoToken(tokenDoCookie(req));
        if (!req.usuario) { enviarJson(401, { mensagem: 'Sua sessão terminou. Entre novamente.' }); return; }
      }

      const rota = roteador.encontrar(req.method, url.pathname);
      if (!rota) { enviarJson(404, { mensagem: 'Rota não encontrada neste produto.' }); return; }

      req.corpo = ['POST', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
      req.consulta = url.searchParams;
      const r = await rota.handler(req, rota.params);
      if (r.bruto !== undefined) {
        res.writeHead(r.status, { 'Content-Type': r.tipo, 'Cache-Control': 'no-store', ...r.cabecalhos });
        res.end(r.bruto);
      } else {
        enviarJson(r.status, r.corpo, r.cabecalhos);
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
