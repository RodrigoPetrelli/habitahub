// Chamadas que respondem 401 como parte do próprio fluxo de login.
const ROTAS_DE_ACESSO = ['/api/login', '/api/sessao'];

export async function api(metodo, caminho, corpo) {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  // Sessão expirada ou encerrada: a aplicação volta para a tela de login.
  if (resposta.status === 401 && !ROTAS_DE_ACESSO.includes(caminho)) {
    window.dispatchEvent(new CustomEvent('habitahub:sessao-encerrada', { detail: dados.mensagem }));
  }
  if (!resposta.ok) {
    const erro = new Error(dados.mensagem || `Erro ${resposta.status}`);
    erro.status = resposta.status;
    erro.erros = dados.erros || {};
    throw erro;
  }
  return dados;
}

export const brl = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

export const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v == null || v === false) continue;
    if (k === 'class') no.className = v;
    else if (k === 'html') no.innerHTML = v;
    else if (k.startsWith('on')) no.addEventListener(k.slice(2), v);
    else if (k in no && typeof v !== 'string') no[k] = v;
    else no.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    no.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return no;
}

// ---------- Componentes visuais do protótipo (prototipo/js/core.js) ----------

// Cor do selo por status, a mesma tabela do protótipo.
const COR_DO_STATUS = {
  'Disponível': 'ok', 'Reservado': 'warn', 'Vendido': 'info', 'Alugado': 'info', 'Inativo': '',
  'Agendada': 'info', 'Realizada': 'ok', 'Cancelada': 'danger',
  'Em análise': 'warn', 'Aprovada': 'ok', 'Recusada': 'danger', 'Contraproposta': 'info',
  'Aguardando assinaturas': 'warn', 'Assinado': 'ok',
};

// etiqueta('Ativo', 'ok') usa a cor dada; sem cor, procura pelo status.
export function etiqueta(texto, tipo = COR_DO_STATUS[texto] ?? '') {
  return el('span', { class: `badge ${tipo}` }, texto);
}

const PALETA = [['#0f766e', '#14b8a6'], ['#9a3412', '#f97316'], ['#1e40af', '#60a5fa'], ['#6b21a8', '#c084fc'], ['#166534', '#4ade80'], ['#334155', '#94a3b8']];
const CASA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>';

// Miniatura de imóvel sem foto: degradê escolhido pelo id + ícone de casa.
export function miniatura(id, tamanho = 'sm') {
  const [a, b] = PALETA[Number(id || 0) % PALETA.length];
  return el('div', { class: `thumb ${tamanho}`, style: `background:linear-gradient(135deg,${a},${b})`, html: CASA_SVG });
}

export function avisar(texto, erro = false) {
  let caixa = document.querySelector('.toasts');
  if (!caixa) caixa = document.body.appendChild(el('div', { class: 'toasts', role: 'status' }));
  const aviso = caixa.appendChild(el('div', { class: `toast ${erro ? 'danger' : 'ok'}` }, texto));
  setTimeout(() => aviso.remove(), 3800);
}

// Modal com cabeçalho, corpo e rodapé. Com aoEnviar, a caixa é um <form>.
//   abrirModal({ titulo, corpo, rodape: (fechar) => [botões], largo, aoEnviar(fechar, form), aoFechar })
export function abrirModal({ titulo, corpo, rodape = () => [], largo = false, aoEnviar, aoFechar }) {
  const fundo = el('div', { class: 'modal-backdrop' });
  let fechado = false;
  const fechar = () => {
    if (fechado) return;
    fechado = true;
    fundo.remove();
    document.removeEventListener('keydown', tecla);
    aoFechar?.();
  };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  const botoes = rodape(fechar);
  const caixa = el(aoEnviar ? 'form' : 'div', {
    class: `modal${largo ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', novalidate: Boolean(aoEnviar),
    onsubmit: aoEnviar && ((e) => { e.preventDefault(); aoEnviar(fechar, caixa); }),
  },
  el('div', { class: 'modal-head' }, el('h2', {}, titulo), el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onclick: fechar }, '✕')),
  el('div', { class: 'modal-body' }, corpo),
  botoes.length ? el('div', { class: 'modal-foot' }, botoes) : null);
  fundo.append(caixa);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fundo);
  caixa.querySelector('input, select, textarea')?.focus();
  return { fechar, caixa };
}

// Confirmação dentro da página (no lugar de window.confirm). Retorna Promise<boolean>.
export function confirmar(texto, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolver) => {
    let resposta = false;
    abrirModal({
      titulo,
      corpo: el('p', {}, texto),
      rodape: (fechar) => [
        el('button', { type: 'button', class: 'btn', onclick: fechar }, 'Cancelar'),
        el('button', { type: 'button', class: `btn ${perigo ? 'btn-danger' : 'btn-primary'}`, onclick: () => { resposta = true; fechar(); } }, ok),
      ],
      aoFechar: () => resolver(resposta),
    });
  });
}
