import { api, el, avisar } from './util.js';

// Componente reutilizado pelas 6 telas de CRUD. Cada tela (js/telas/*.js) só
// descreve título, recurso da API, campos do formulário e colunas da tabela.
//
// definicao = {
//   titulo, recurso, descricao,
//   fontes:  { imoveis: (i) => rótulo }      cadastros usados em selects e colunas
//   campos:  [{ nome, rotulo, tipo, opcoes, fonte, largura, dica, padrao }]
//   colunas: [{ rotulo, valor: (registro, tela) => texto ou nó }]
//   aoAbrirFormulario(form, registro, tela)  gancho opcional
// }
export class TelaCrud {
  constructor(definicao, produto) {
    this.def = definicao;
    this.produto = produto;
    this.fontes = {};
    this.registros = [];
  }

  async montar(container) {
    this.container = container;
    await this.recarregar();
  }

  async recarregar() {
    const nomesFontes = Object.keys(this.def.fontes || {});
    const [registros, ...listas] = await Promise.all([
      api('GET', `/api/${this.def.recurso}`),
      ...nomesFontes.map((n) => api('GET', `/api/${n}`)),
    ]);
    this.registros = registros;
    nomesFontes.forEach((nome, i) => {
      this.fontes[nome] = { lista: listas[i], mapa: new Map(listas[i].map((x) => [x.id, x])), rotulo: this.def.fontes[nome] };
    });
    this.#renderizar();
  }

  // Rótulo de um registro relacionado, ex.: rotuloDe('imoveis', 3) → "HH-0003 – Studio…"
  rotuloDe(fonte, id) {
    const f = this.fontes[fonte];
    const item = f?.mapa.get(Number(id));
    return item ? f.rotulo(item) : '—';
  }

  #renderizar() {
    const { titulo, descricao, colunas } = this.def;
    const linhas = this.registros.map((r) => el('tr', {},
      colunas.map((c) => el('td', {}, c.valor(r, this) ?? '')),
      el('td', { class: 'acoes-linha' },
        el('button', { class: 'btn pequeno', onclick: () => this.abrirFormulario(r) }, 'Editar'), ' ',
        el('button', { class: 'btn pequeno perigo', onclick: () => this.excluir(r) }, 'Excluir')),
    ));

    this.container.replaceChildren(
      el('div', { class: 'cabecalho' },
        el('div', {}, el('h1', {}, titulo), descricao ? el('p', { class: 'muted' }, descricao) : null),
        el('button', { class: 'btn primario', onclick: () => this.abrirFormulario(null) }, `+ Novo`)),
      el('div', { class: 'tabela-wrap' },
        el('table', {},
          el('thead', {}, el('tr', {}, colunas.map((c) => el('th', {}, c.rotulo)), el('th', {}))),
          el('tbody', {}, linhas.length ? linhas : el('tr', {}, el('td', { class: 'vazio', colSpan: colunas.length + 1 }, 'Nenhum registro cadastrado.'))))),
    );
  }

  #opcoesDo(campo) {
    if (campo.fonte) {
      const f = this.fontes[campo.fonte];
      return f.lista.map((item) => ({ valor: item.id, rotulo: f.rotulo(item) }));
    }
    const opcoes = typeof campo.opcoes === 'function' ? campo.opcoes(this.produto) : campo.opcoes;
    return opcoes.map((o) => ({ valor: o, rotulo: o }));
  }

  #criarCampo(campo, valor) {
    const id = `campo-${campo.nome}`;
    let entrada;
    if (campo.tipo === 'select') {
      entrada = el('select', { id, name: campo.nome },
        el('option', { value: '' }, 'Selecione…'),
        this.#opcoesDo(campo).map((o) => el('option', { value: o.valor, selected: String(o.valor) === String(valor ?? '') }, o.rotulo)));
    } else if (campo.tipo === 'textarea') {
      entrada = el('textarea', { id, name: campo.nome }, valor ?? '');
    } else if (campo.tipo === 'checkbox') {
      entrada = el('input', { id, name: campo.nome, type: 'checkbox', checked: Boolean(valor) });
      return el('div', { class: 'campo check', 'data-campo': campo.nome }, entrada, el('label', { for: id }, campo.rotulo), el('span', { class: 'erro' }));
    } else {
      entrada = el('input', { id, name: campo.nome, type: campo.tipo || 'text', value: valor ?? '', step: campo.tipo === 'number' ? 'any' : null, placeholder: campo.exemplo || null });
    }
    return el('div', { class: `campo ${campo.largura || ''}`, 'data-campo': campo.nome },
      el('label', { for: id }, campo.rotulo),
      entrada,
      campo.dica ? el('span', { class: 'dica' }, campo.dica) : null,
      el('span', { class: 'erro' }));
  }

  #lerFormulario(form) {
    const dados = {};
    for (const campo of this.def.campos) {
      const entrada = form.elements[campo.nome];
      if (campo.tipo === 'checkbox') dados[campo.nome] = entrada.checked;
      else if (campo.tipo === 'number' || campo.fonte) dados[campo.nome] = entrada.value === '' ? '' : Number(entrada.value);
      else dados[campo.nome] = entrada.value;
    }
    return dados;
  }

  abrirFormulario(registro) {
    const dialogo = document.getElementById('dialogo');
    const form = document.getElementById('formulario');
    const novo = registro == null;
    document.getElementById('dialogo-titulo').textContent = `${novo ? 'Novo' : 'Editar'} – ${this.def.titulo}`;
    document.getElementById('erro-geral').textContent = '';
    document.getElementById('campos').replaceChildren(
      ...this.def.campos.map((c) => this.#criarCampo(c, novo ? c.padrao : registro[c.nome])));

    this.def.aoAbrirFormulario?.(form, registro, this);

    form.onsubmit = async (evento) => {
      evento.preventDefault();
      form.querySelectorAll('.campo').forEach((c) => { c.classList.remove('invalido'); c.querySelector('.erro').textContent = ''; });
      document.getElementById('erro-geral').textContent = '';
      try {
        const dados = this.#lerFormulario(form);
        if (novo) await api('POST', `/api/${this.def.recurso}`, dados);
        else await api('PUT', `/api/${this.def.recurso}/${registro.id}`, dados);
        dialogo.close();
        avisar(novo ? 'Cadastro criado.' : 'Alterações salvas.');
        await this.recarregar();
      } catch (e) {
        const naoMostrados = [];
        for (const [nome, msg] of Object.entries(e.erros || {})) {
          const campo = form.querySelector(`[data-campo="${nome}"]`);
          if (campo) { campo.classList.add('invalido'); campo.querySelector('.erro').textContent = msg; } else naoMostrados.push(msg);
        }
        document.getElementById('erro-geral').textContent = [e.message, ...naoMostrados].join(' ');
      }
    };
    document.getElementById('cancelar').onclick = () => dialogo.close();
    dialogo.showModal();
  }

  async excluir(registro) {
    if (!confirm(`Excluir este registro de ${this.def.titulo.toLowerCase()}?`)) return;
    try {
      await api('DELETE', `/api/${this.def.recurso}/${registro.id}`);
      avisar('Registro excluído.');
      await this.recarregar();
    } catch (e) {
      avisar(e.message, true);
    }
  }
}
