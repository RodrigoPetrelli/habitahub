import { api, el, avisar, abrirModal, confirmar } from './util.js';

// Componente reutilizado pelas 6 telas de CRUD. Cada tela (js/telas/*.js) só
// descreve título, recurso da API, campos do formulário e colunas da tabela.
// O visual segue o protótipo: cabeçalho de página, cartão com busca e tabela,
// formulário em modal e confirmação de exclusão dentro da página.
//
// definicao = {
//   titulo, recurso, descricao,
//   fontes:  { imoveis: (i) => rótulo }      cadastros usados em selects e colunas
//   campos:  [{ nome, rotulo, tipo, opcoes, fonte, largura, dica, padrao, autocompletar, soAdministrador, soNaEdicao }]
//   colunas: [{ rotulo, valor: (registro, tela) => texto ou nó, classe }]
//   permissoes: { criar(usuario), editar(registro, usuario), excluir(registro, usuario) }  opcional;
//               sem ela, tudo é permitido (o servidor confere de novo)
//   aoAbrirFormulario(form, registro, tela)  gancho opcional
// }
export class TelaCrud {
  constructor(definicao, produto, usuario) {
    this.def = definicao;
    this.produto = produto;
    this.usuario = usuario;
    this.fontes = {};
    this.registros = [];
    this.busca = '';
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

  #pode(acao, registro) {
    const regra = this.def.permissoes?.[acao];
    return !regra || (acao === 'criar' ? regra(this.usuario) : regra(registro, this.usuario));
  }

  #renderizar() {
    const { titulo, descricao, colunas } = this.def;
    const linhas = this.registros.map((r) => el('tr', {},
      colunas.map((c) => el('td', { class: c.classe || null }, c.valor(r, this) ?? '')),
      el('td', { class: 'acoes-linha' },
        this.#pode('editar', r) ? el('button', { class: 'btn btn-sm', onclick: () => this.abrirFormulario(r) }, 'Editar') : null, ' ',
        this.#pode('excluir', r) ? el('button', { class: 'btn btn-sm btn-ghost perigo', onclick: () => this.excluir(r) }, 'Excluir') : null),
    ));

    const contador = el('span', { class: 'muted small' });
    const semResultado = el('div', { class: 'empty hidden' }, 'Nenhum registro corresponde à busca.');
    const filtrar = () => {
      const termo = normalizar(this.busca);
      let visiveis = 0;
      linhas.forEach((tr) => {
        const mostra = !termo || normalizar(tr.textContent).includes(termo);
        tr.classList.toggle('hidden', !mostra);
        visiveis += mostra;
      });
      contador.textContent = termo ? `${visiveis} de ${linhas.length} registro(s)` : `${linhas.length} registro(s)`;
      semResultado.classList.toggle('hidden', visiveis > 0 || !linhas.length);
    };

    this.container.replaceChildren(
      el('div', { class: 'page-head' },
        el('div', {}, el('h1', {}, titulo), descricao ? el('p', { class: 'sub' }, descricao) : null),
        this.#pode('criar') ? el('button', { class: 'btn btn-primary', onclick: () => this.abrirFormulario(null) }, `+ Novo cadastro`) : null),
      el('div', { class: 'card' },
        el('div', { class: 'row between' },
          el('input', { class: 'input busca', type: 'search', placeholder: `Buscar em ${titulo.toLowerCase()}…`, value: this.busca, 'aria-label': 'Buscar',
            oninput: (e) => { this.busca = e.target.value; filtrar(); } }),
          contador),
        linhas.length
          ? el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
            el('thead', {}, el('tr', {}, colunas.map((c) => el('th', {}, c.rotulo)), el('th', {}))),
            el('tbody', {}, linhas)))
          : el('div', { class: 'empty' }, 'Nenhum registro cadastrado.'),
        semResultado),
    );
    filtrar();
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
      entrada = el('select', { id, name: campo.nome, class: 'input' },
        el('option', { value: '' }, 'Selecione…'),
        this.#opcoesDo(campo).map((o) => el('option', { value: o.valor, selected: String(o.valor) === String(valor ?? '') }, o.rotulo)));
    } else if (campo.tipo === 'textarea') {
      entrada = el('textarea', { id, name: campo.nome, class: 'input' }, valor ?? '');
    } else if (campo.tipo === 'checkbox') {
      entrada = el('input', { id, name: campo.nome, type: 'checkbox', checked: Boolean(valor) });
      return el('div', { class: 'field check', 'data-campo': campo.nome }, entrada, el('label', { for: id }, campo.rotulo), el('span', { class: 'error-msg' }));
    } else {
      entrada = el('input', { id, name: campo.nome, class: 'input', type: campo.tipo || 'text', value: valor ?? '', step: campo.tipo === 'number' ? 'any' : null, placeholder: campo.exemplo || null, autocomplete: campo.autocompletar || null });
    }
    return el('div', { class: `field ${campo.largura || ''}`, 'data-campo': campo.nome },
      el('label', { for: id }, campo.rotulo),
      entrada,
      campo.dica ? el('span', { class: 'hint' }, campo.dica) : null,
      el('span', { class: 'error-msg' }));
  }

  // Campos marcados como soAdministrador nem aparecem para os outros usuários;
  // os marcados como soNaEdicao não aparecem no cadastro de um registro novo.
  #camposVisiveis(novo) {
    return this.def.campos.filter((c) => (!c.soAdministrador || this.usuario?.administrador) && (!c.soNaEdicao || !novo));
  }

  #lerFormulario(form, novo) {
    const dados = {};
    for (const campo of this.#camposVisiveis(novo)) {
      const entrada = form.elements[campo.nome];
      if (campo.tipo === 'checkbox') dados[campo.nome] = entrada.checked;
      else if (campo.tipo === 'number' || campo.fonte) dados[campo.nome] = entrada.value === '' ? '' : Number(entrada.value);
      else dados[campo.nome] = entrada.value;
    }
    return dados;
  }

  abrirFormulario(registro) {
    const novo = registro == null;
    const erroGeral = el('div', { class: 'alert danger hidden', role: 'alert' });
    const { caixa: form } = abrirModal({
      titulo: novo ? `Novo cadastro – ${this.def.titulo}` : `Editar – ${this.def.titulo}`,
      largo: this.#camposVisiveis(novo).length > 6,
      corpo: [erroGeral, el('div', { class: 'form-grid' }, this.#camposVisiveis(novo).map((c) => this.#criarCampo(c, novo ? c.padrao : registro[c.nome])))],
      rodape: (fechar) => [
        el('button', { type: 'button', class: 'btn', onclick: fechar }, 'Cancelar'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, novo ? 'Cadastrar' : 'Salvar alterações'),
      ],
      aoEnviar: async (fechar, form) => {
        form.querySelectorAll('.field').forEach((c) => { c.querySelector('.input')?.classList.remove('invalid'); c.querySelector('.error-msg').textContent = ''; });
        erroGeral.classList.add('hidden');
        const botao = form.querySelector('[type=submit]');
        botao.disabled = true;
        try {
          const dados = this.#lerFormulario(form, novo);
          if (novo) await api('POST', `/api/${this.def.recurso}`, dados);
          else await api('PUT', `/api/${this.def.recurso}/${registro.id}`, dados);
          fechar();
          avisar(novo ? 'Cadastro criado.' : 'Alterações salvas.');
          await this.recarregar();
        } catch (e) {
          const naoMostrados = [];
          for (const [nome, msg] of Object.entries(e.erros || {})) {
            const campo = form.querySelector(`[data-campo="${nome}"]`);
            if (campo) { campo.querySelector('.input')?.classList.add('invalid'); campo.querySelector('.error-msg').textContent = msg; } else naoMostrados.push(msg);
          }
          erroGeral.textContent = [e.message, ...naoMostrados].join(' ');
          erroGeral.classList.remove('hidden');
          form.querySelector('.invalid')?.focus();
        } finally {
          botao.disabled = false;
        }
      },
    });
    this.def.aoAbrirFormulario?.(form, registro, this);
  }

  async excluir(registro) {
    const ok = await confirmar(`Este registro de ${this.def.titulo.toLowerCase()} será excluído definitivamente.`, { titulo: 'Excluir registro', ok: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await api('DELETE', `/api/${this.def.recurso}/${registro.id}`);
      avisar('Registro excluído.');
      await this.recarregar();
    } catch (e) {
      avisar(e.message, true);
    }
  }
}

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
