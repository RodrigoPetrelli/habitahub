import { api, el, etiqueta, dataHora } from './util.js';
import { TelaCrud } from './TelaCrud.js';
import corretores from './telas/corretores.js';
import proprietarios from './telas/proprietarios.js';
import clientes from './telas/clientes.js';
import imoveis from './telas/imoveis.js';
import visitas from './telas/visitas.js';
import propostas from './telas/propostas.js';

const TELAS = { corretores, proprietarios, clientes, imoveis, visitas, propostas };
const conteudo = document.getElementById('conteudo');
let produto;

// Pontos de variação VP1/VP2 no front-end: telas de features desligadas somem do menu.
const telaAtiva = (tela) => !tela.feature || produto.features[tela.feature];

function montarMenu(rotaAtual) {
  const link = (rota, texto) => el('a', { href: `#/${rota}`, class: rota === rotaAtual ? 'ativo' : '' }, texto);
  const cadastros = ['corretores', 'proprietarios', 'clientes', 'imoveis'];
  const atendimento = ['visitas', 'propostas'].filter((r) => telaAtiva(TELAS[r]));
  const itens = [
    link('inicio', 'Início'),
    el('div', { class: 'secao' }, 'Cadastros'),
    cadastros.map((r) => link(r, TELAS[r].titulo)),
    atendimento.length ? el('div', { class: 'secao' }, 'Atendimento') : null,
    atendimento.map((r) => link(r, TELAS[r].titulo)),
    el('div', { class: 'secao' }, 'Acompanhamento'),
    link('relatorios', 'Relatórios'),
    link('notificacoes', 'Notificações'),
  ];
  document.getElementById('menu').replaceChildren(...itens.flat().filter(Boolean));
}

function telaInicio() {
  const f = produto.features;
  const linha = (nome, tipo, valor) => el('tr', {}, el('td', {}, nome), el('td', {}, tipo), el('td', {}, valor));
  const onOff = (v) => (v ? etiqueta('incluída', 'on') : etiqueta('não incluída', 'off'));
  conteudo.replaceChildren(
    el('h1', {}, produto.nome),
    el('p', { class: 'muted' }, produto.descricao),
    el('div', { class: 'cartao' },
      el('h2', {}, 'Configuração deste produto da linha'),
      el('p', { class: 'muted' }, `Produto "${produto.id}", carregado de sistema/produtos/${produto.id}.json. Troque o produto ao iniciar o servidor (--produto=…) para ver outra configuração.`),
      el('div', { class: 'tabela-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Feature'), el('th', {}, 'Tipo'), el('th', {}, 'Neste produto'))),
        el('tbody', {},
          linha('Cadastros (corretores, proprietários, clientes, imóveis)', 'obrigatória', etiqueta('incluída', 'on')),
          linha('Visitas', 'opcional', onOff(f.visitas)),
          linha('Propostas', 'opcional (requer Visitas)', onOff(f.propostas)),
          linha('Modalidades de negócio', 'grupo OR', f.modalidades.join(', ')),
          linha('Canal de notificação', 'alternativa', f.notificacao),
          linha('Formatos de exportação', 'grupo OR', f.exportacao.join(', ').toUpperCase()),
          linha('Comissão de venda', 'parâmetro', `${produto.parametros.comissaoVendaPercentual}%`),
        )))),
  );
}

function telaRelatorios() {
  const tipos = [
    { id: 'imoveis', titulo: 'Carteira de imóveis', ativo: true },
    { id: 'visitas', titulo: 'Visitas e feedbacks', ativo: produto.features.visitas },
    { id: 'propostas', titulo: 'Propostas e comissões', ativo: produto.features.propostas },
  ].filter((t) => t.ativo);
  conteudo.replaceChildren(
    el('h1', {}, 'Relatórios'),
    el('p', { class: 'muted' }, 'Os relatórios seguem o mesmo roteiro (Template Method) e o formato de saída é uma estratégia (Strategy). Os formatos disponíveis dependem do produto.'),
    el('div', { class: 'grade' }, tipos.map((t) => el('div', { class: 'cartao' },
      el('h3', {}, t.titulo),
      produto.features.exportacao.map((fmt) => [el('a', { class: 'btn pequeno', href: `/api/relatorios/${t.id}?formato=${fmt}`, target: '_blank' }, fmt.toUpperCase()), ' '])))),
  );
}

async function telaNotificacoes() {
  const lista = await api('GET', '/api/notificacoes');
  conteudo.replaceChildren(
    el('h1', {}, 'Notificações enviadas'),
    el('p', { class: 'muted' }, `Canal ativo neste produto: ${produto.features.notificacao}. O envio é simulado e fica registrado na tabela "notificacoes".`),
    el('div', { class: 'tabela-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Quando'), el('th', {}, 'Canal'), el('th', {}, 'Destinatário'), el('th', {}, 'Mensagem'))),
      el('tbody', {}, lista.length
        ? lista.map((n) => el('tr', {}, el('td', {}, dataHora(`${n.enviadoEm.replace(' ', 'T')}Z`)), el('td', {}, n.canal), el('td', {}, n.destinatario), el('td', { style: 'white-space:pre-line' }, n.mensagem)))
        : el('tr', {}, el('td', { class: 'vazio', colSpan: 4 }, 'Nenhuma notificação ainda.'))))),
  );
}

async function navegar() {
  const rota = location.hash.replace(/^#\//, '') || 'inicio';
  montarMenu(rota);
  try {
    if (TELAS[rota] && telaAtiva(TELAS[rota])) await new TelaCrud(TELAS[rota], produto).montar(conteudo);
    else if (rota === 'relatorios') telaRelatorios();
    else if (rota === 'notificacoes') await telaNotificacoes();
    else if (TELAS[rota]) conteudo.replaceChildren(el('h1', {}, 'Módulo não incluído'), el('p', { class: 'muted' }, `A feature "${TELAS[rota].feature}" não faz parte do produto ${produto.nome}.`));
    else telaInicio();
  } catch (e) {
    conteudo.replaceChildren(el('h1', {}, 'Erro'), el('p', {}, e.message));
  }
}

async function iniciar() {
  produto = await api('GET', '/api/produto');
  document.title = `HabitaHub – ${produto.id}`;
  document.getElementById('produto-nome').textContent = produto.nome;
  // Parâmetro visual do produto (cor da marca).
  document.documentElement.style.setProperty('--primary', produto.parametros.corPrimaria);
  window.addEventListener('hashchange', navegar);
  await navegar();
}

iniciar();
