export async function api(metodo, caminho, corpo) {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
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

export function etiqueta(texto, tipo = '') {
  return el('span', { class: `etiqueta ${tipo}` }, texto);
}

let temporizador;
export function avisar(texto, erro = false) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.className = `aviso visivel${erro ? ' erro' : ''}`;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { aviso.className = 'aviso'; }, 3500);
}
