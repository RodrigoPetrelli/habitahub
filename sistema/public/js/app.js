import { api, el, etiqueta, dataHora, miniatura } from './util.js';
import { TelaCrud } from './TelaCrud.js';
import { montarLogin, montarCadastro } from './acesso.js';
import corretores from './telas/corretores.js';
import proprietarios from './telas/proprietarios.js';
import clientes from './telas/clientes.js';
import imoveis from './telas/imoveis.js';
import visitas from './telas/visitas.js';
import propostas from './telas/propostas.js';
import contratos from './telas/contratos.js';
import avaliacoes from './telas/avaliacoes.js';

const TELAS = { corretores, proprietarios, clientes, imoveis, visitas, avaliacoes, propostas, contratos };
const shell = document.getElementById('shell');
const telaLogin = document.getElementById('tela-login');
const conteudo = document.getElementById('conteudo');
let produto;
let usuario = null;

// Pontos de variação VP1, VP2, VP6 e VP7 no front-end: telas de features desligadas somem do menu.
const telaAtiva = (tela) => !tela.feature || produto.features[tela.feature];

// Menu lateral em grupos, como a sidebar do protótipo.
function montarMenu(rotaAtual) {
  const link = (rota, texto) => el('a', { href: `#/${rota}`, class: rota === rotaAtual ? 'active' : '' }, texto);
  const grupo = (nome, itens) => (itens.length ? [el('div', { class: 'nav-group' }, nome), itens] : []);
  const telas = (rotas) => rotas.filter((r) => telaAtiva(TELAS[r])).map((r) => link(r, TELAS[r].titulo));
  document.getElementById('menu').replaceChildren(...[
    grupo('Imobiliária', [link('inicio', 'Painel')]),
    grupo('Cadastros', telas(['imoveis', 'proprietarios', 'clientes', 'corretores'])),
    grupo('Atendimento', telas(['visitas', 'avaliacoes', 'propostas', 'contratos'])),
    grupo('Acompanhamento', [link('relatorios', 'Relatórios'), link('notificacoes', 'Notificações')]),
  ].flat(2));
}

const cabecalho = (titulo, sub, ...acoes) => el('div', { class: 'page-head' },
  el('div', {}, el('h1', {}, titulo), sub ? el('p', { class: 'sub' }, sub) : null), acoes);
const kpi = (rotulo, valor, complemento) => el('div', { class: 'kpi' },
  el('div', { class: 'label' }, rotulo), el('div', { class: 'value' }, valor, complemento ? el('small', {}, ` ${complemento}`) : null));
const vazio = (texto) => el('div', { class: 'empty' }, texto);
const tabela = (cabecalhos, linhas) => el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
  cabecalhos ? el('thead', {}, el('tr', {}, cabecalhos.map((c) => el('th', {}, c)))) : null,
  el('tbody', {}, linhas)));

// Painel inicial: indicadores, próximas visitas e a configuração do produto da linha.
async function telaInicio() {
  const f = produto.features;
  const [listaCorretores, listaImoveis, listaClientes, listaVisitas, listaPropostas] = await Promise.all([
    api('GET', '/api/corretores'),
    api('GET', '/api/imoveis'),
    api('GET', '/api/clientes'),
    f.visitas ? api('GET', '/api/visitas') : [],
    f.propostas ? api('GET', '/api/propostas') : [],
  ]);
  const imovel = new Map(listaImoveis.map((i) => [i.id, i]));
  const cliente = new Map(listaClientes.map((c) => [c.id, c]));
  const disponiveis = listaImoveis.filter((i) => i.status === 'Disponível').length;
  const proximas = listaVisitas
    .filter((v) => v.status === 'Agendada' && new Date(v.dataHora) > new Date())
    .sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)));
  const emAnalise = listaPropostas.filter((p) => p.status === 'Em análise').length;
  // Só quem pode aprovar vê o aviso de contas pendentes.
  const aguardando = usuario.administrador ? listaCorretores.filter((c) => c.aguardandoAprovacao).length : 0;

  const linhaFeature = (nome, tipo, valor) => el('tr', {}, el('td', {}, nome), el('td', { class: 'muted' }, tipo), el('td', {}, valor));
  const onOff = (v) => (v ? etiqueta('incluída', 'ok') : etiqueta('não incluída', 'danger'));

  conteudo.replaceChildren(
    cabecalho('Painel', produto.descricao),
    aguardando
      ? el('div', { class: 'alert info row between' },
        el('span', {}, aguardando === 1 ? '1 corretor criou uma conta e aguarda aprovação.' : `${aguardando} corretores criaram uma conta e aguardam aprovação.`),
        el('a', { class: 'btn btn-sm', href: '#/corretores' }, 'Revisar cadastros'))
      : '', // replaceChildren escreveria null como texto
    el('div', { class: 'grid grid-4' },
      kpi('Imóveis disponíveis', disponiveis, `de ${listaImoveis.length}`),
      kpi('Clientes', listaClientes.length),
      f.visitas ? kpi('Visitas agendadas', proximas.length) : null,
      f.propostas ? kpi('Propostas em análise', emAnalise) : null),
    el('div', { class: 'grid grid-2 mt' },
      f.visitas
        ? el('div', { class: 'card' },
          el('div', { class: 'card-title' }, el('h3', {}, 'Próximas visitas'), el('a', { href: '#/visitas' }, 'Ver todas')),
          proximas.length
            ? tabela(null, proximas.slice(0, 5).map((v) => {
              const i = imovel.get(v.imovelId) || {};
              return el('tr', {}, el('td', {}, miniatura(v.imovelId)), el('td', {}, dataHora(v.dataHora)),
                el('td', {}, `${i.codigo || ''} · ${i.titulo || ''}`), el('td', { class: 'muted' }, cliente.get(v.clienteId)?.nome || ''));
            }))
            : vazio('Nenhuma visita agendada.'))
        : null,
      el('div', { class: 'card' },
        el('div', { class: 'card-title' }, el('h3', {}, 'Configuração deste produto da linha'), etiqueta(produto.id, 'primary')),
        el('p', { class: 'muted small' }, `Carregado de sistema/produtos/${produto.id}.json. Troque o produto ao iniciar o servidor (--produto=…) para ver outra configuração.`),
        tabela(['Feature', 'Tipo', 'Neste produto'], [
          linhaFeature('Cadastros', 'obrigatória', etiqueta('incluída', 'ok')),
          linhaFeature('Visitas', 'opcional', onOff(f.visitas)),
          linhaFeature('Avaliações', 'opcional (requer Visitas)', onOff(f.avaliacoes)),
          linhaFeature('Propostas', 'opcional (requer Visitas)', onOff(f.propostas)),
          linhaFeature('Contratos', 'opcional (requer Propostas)', onOff(f.contratos)),
          linhaFeature('Modalidades de negócio', 'grupo OR', f.modalidades.join(', ')),
          linhaFeature('Canal de notificação', 'alternativa', f.notificacao),
          linhaFeature('Formatos de exportação', 'grupo OR', f.exportacao.join(', ').toUpperCase()),
          linhaFeature('Comissão de venda', 'parâmetro', `${produto.parametros.comissaoVendaPercentual}%`),
        ]))),
  );
}

function telaRelatorios() {
  const tipos = [
    { id: 'imoveis', titulo: 'Carteira de imóveis', texto: 'Todos os imóveis com preço, preço/m², endereço, proprietário e corretor.', ativo: true },
    { id: 'visitas', titulo: 'Visitas e feedbacks', texto: 'Visitas com imóvel, cliente, corretor, status e feedback.', ativo: produto.features.visitas },
    { id: 'propostas', titulo: 'Propostas e comissões', texto: 'Propostas com valor ofertado e comissão estimada.', ativo: produto.features.propostas },
  ].filter((t) => t.ativo);
  conteudo.replaceChildren(
    cabecalho('Relatórios', 'Os relatórios seguem o mesmo roteiro (Template Method) e o formato de saída é uma estratégia (Strategy). Os formatos disponíveis dependem do produto.'),
    el('div', { class: 'grid grid-3' }, tipos.map((t) => el('div', { class: 'card' },
      el('h3', {}, t.titulo),
      el('p', { class: 'muted' }, t.texto),
      el('div', { class: 'row' }, produto.features.exportacao.map((fmt) =>
        el('a', { class: 'btn btn-sm', href: `/api/relatorios/${t.id}?formato=${fmt}`, target: '_blank' }, `Exportar ${fmt.toUpperCase()}`)))))),
  );
}

async function telaNotificacoes() {
  const lista = await api('GET', '/api/notificacoes');
  conteudo.replaceChildren(
    cabecalho('Notificações enviadas', `O envio é simulado e fica registrado na tabela "notificacoes".`, etiqueta(`Canal: ${produto.features.notificacao}`, 'primary')),
    el('div', { class: 'card' }, lista.length
      ? el('ul', { class: 'timeline' }, lista.map((n) => el('li', {},
        el('div', { class: 'when' }, `${dataHora(`${n.enviadoEm.replace(' ', 'T')}Z`)} · ${n.canal} · ${n.destinatario}`),
        el('div', { class: 'texto' }, n.mensagem))))
      : vazio('Nenhuma notificação ainda.')),
  );
}

async function navegar() {
  if (!usuario) { mostrarAcesso(); return; }
  const rota = location.hash.replace(/^#\//, '') || 'inicio';
  shell.classList.remove('nav-open');
  montarMenu(rota);
  try {
    if (TELAS[rota] && telaAtiva(TELAS[rota])) await new TelaCrud(TELAS[rota], produto, usuario).montar(conteudo);
    else if (rota === 'relatorios') telaRelatorios();
    else if (rota === 'notificacoes') await telaNotificacoes();
    else if (TELAS[rota]) conteudo.replaceChildren(cabecalho('Módulo não incluído'), el('div', { class: 'alert info' }, `A feature "${TELAS[rota].feature}" não faz parte do produto ${produto.nome}.`));
    else await telaInicio();
  } catch (e) {
    if (!usuario) return; // a sessão terminou durante a chamada: o login já está na tela
    conteudo.replaceChildren(cabecalho('Erro'), el('div', { class: 'alert danger' }, `Não foi possível carregar a tela: ${e.message}`));
  }
}

// ---------- Acesso ----------
const iniciais = (nome) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// Sem usuário logado: #/cadastro mostra "Criar conta"; qualquer outra rota, o login.
function mostrarAcesso({ aviso, sucesso } = {}) {
  usuario = null;
  shell.classList.add('hidden');
  conteudo.replaceChildren();
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
  telaLogin.classList.remove('hidden');
  window.scrollTo(0, 0);
  if (location.hash === '#/cadastro') {
    document.title = `Criar conta · HabitaHub – ${produto.id}`;
    montarCadastro(telaLogin, {
      produto,
      aoConcluir: (resposta) => {
        if (resposta.usuario) { mostrarSistema(resposta.usuario); return; } // criou a organização: já entra
        history.replaceState(null, '', '#/login');
        mostrarAcesso({ sucesso: `Cadastro enviado para aprovação de ${resposta.organizacao.nome}. Quando um administrador liberar o acesso, ${resposta.email} vai receber um aviso e você poderá entrar.` });
      },
    }).catch((e) => telaLogin.replaceChildren(el('div', { class: 'alert danger' }, `Não foi possível abrir o cadastro: ${e.message}`)));
  } else {
    document.title = `Entrar · HabitaHub – ${produto.id}`;
    montarLogin(telaLogin, { produto, aviso, sucesso, aoEntrar: mostrarSistema });
  }
}

async function mostrarSistema(logado) {
  usuario = logado;
  if (['#/login', '#/cadastro'].includes(location.hash)) history.replaceState(null, '', '#/inicio');
  telaLogin.classList.add('hidden');
  telaLogin.replaceChildren();
  document.getElementById('usuario').replaceChildren(
    el('span', { class: 'avatar' }, iniciais(usuario.nome)),
    el('span', { class: 'nome' }, el('strong', {}, usuario.nome), el('br'),
      el('span', { class: 'small muted' }, `${usuario.administrador ? 'Administrador' : 'Corretor'} · ${usuario.organizacao.nome}`)));
  shell.classList.remove('hidden');
  window.scrollTo(0, 0);
  document.title = `HabitaHub – ${produto.id}`;
  await navegar();
}

async function sair() {
  await api('POST', '/api/logout').catch(() => {});
  mostrarAcesso();
}

async function iniciar() {
  produto = await api('GET', '/api/produto');
  document.getElementById('produto-nome').textContent = produto.nome;
  // Parâmetro visual do produto (cor da marca). Hover e tom suave derivam dela no CSS.
  document.documentElement.style.setProperty('--primary', produto.parametros.corPrimaria);
  document.getElementById('menu-toggle').addEventListener('click', () => shell.classList.toggle('nav-open'));
  document.getElementById('sair').addEventListener('click', sair);
  window.addEventListener('hashchange', navegar);
  // Qualquer chamada da API que volte 401 (sessão expirada, senha trocada, acesso desativado).
  window.addEventListener('habitahub:sessao-encerrada', (e) => { if (usuario) mostrarAcesso({ aviso: e.detail }); });

  const logado = await api('GET', '/api/sessao').catch(() => null);
  if (logado) await mostrarSistema(logado);
  else mostrarAcesso();
}

iniciar();
