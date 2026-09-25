/* HabitaHub – fatia vertical 2: Imóvel (UC01 Incluir, UC02 Alterar, UC03 Excluir).
 * Equipe: #/imoveis, #/imoveis/novo, #/imoveis/:id/editar
 * Cliente: #/catalogo, #/imovel/:id, #/meus-imoveis, #/meus-imoveis/:id
 * Slots que esta fatia renderiza: 'imovel.detalhe.acoes' e 'proprietario.imovel'.
 * Slot com que esta fatia contribui: 'painel.pendencias'.
 */
(function () {
  'use strict';
  const { esc } = HH;

  const TIPOS = ['Apartamento', 'Casa', 'Sobrado', 'Studio', 'Cobertura', 'Terreno', 'Comercial'];
  const MODALIDADES = ['Venda', 'Aluguel'];
  const STATUS = ['Disponível', 'Reservado', 'Indisponível', 'Inativo'];

  // Mensagens exatas da especificação.
  const MSG = {
    cepFora: 'Serviço CEP indisponível. Preencha o endereço manualmente.', // UC01 E1
    cepNaoEncontrado: 'CEP não encontrado. Preencha o endereço manualmente.', // UC01 A1
    creci: 'Registro CRECI inválido ou suspenso. Cadastro não permitido.', // UC01 E2
    obrigatorios: 'Por favor, preencha todos os campos obrigatórios (marcados com *).', // UC01 E3
    valor: 'O valor do imóvel deve ser superior a zero.', // UC02 E1
    vinculo: 'Não é possível excluir imóveis com propostas pendentes ou contratos ativos.', // UC03 E1
    confirmar: 'Deseja realmente inativar este imóvel?', // UC03 passo 3
    naoEncontrado: 'Imóvel não encontrado.',
  };

  // ---------- Utilitários locais ----------
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const user = (id) => HH.find('usuarios', id);
  const nomeDe = (id) => (user(id) || {}).nome || '—';
  const preco = (im) => HH.money(im.valor) + (im.modalidade === 'Aluguel' ? '<span class="muted small"> /mês</span>' : '');
  const precoTxt = (im) => HH.money(im.valor) + (im.modalidade === 'Aluguel' ? ' /mês' : '');
  const enderecoLinha = (im) => [im.logradouro && `${im.logradouro}${im.numero ? ', ' + im.numero : ''}`, im.complemento].filter(Boolean).join(' – ');
  const localLinha = (im) => [im.bairro, im.cidade && `${im.cidade}${im.uf ? '/' + im.uf : ''}`].filter(Boolean).join(', ');
  const quartosTxt = (q) => (Number(q) > 0 ? `${q} ${Number(q) === 1 ? 'quarto' : 'quartos'}` : 'Sem quartos');
  const formatCep = (v) => HH.onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  const opt = (v, sel, label) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label ?? v)}</option>`;

  function mediaImovel(imovelId) {
    const avs = HH.where('avaliacoes', (a) => a.imovelId === imovelId && a.notaImovel != null);
    return { n: avs.length, media: avs.length ? avs.reduce((s, a) => s + Number(a.notaImovel), 0) / avs.length : 0 };
  }

  // UC03 E1 / README: vínculos que impedem a inativação.
  function vinculosImpeditivos(im) {
    const props = HH.where('propostas', (p) => p.imovelId === im.id && ['Em Análise', 'Contraproposta', 'Aprovada'].includes(p.status));
    const conts = HH.where('contratos', (c) => c.imovelId === im.id && c.status !== 'Recusado pelo Assinante');
    return [
      ...props.map((p) => `Proposta de ${HH.money(HH.valorFinal(p))} (${p.status}) de ${nomeDe(p.clienteId)}`),
      ...conts.map((c) => `Contrato ${c.numero || ''} (${c.status})`),
    ];
  }

  // Reduz a foto para caber no localStorage (máx. 1024 px, JPEG).
  function lerFoto(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => resolve(fr.result);
        img.onload = () => {
          const max = 1024;
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          try { resolve(c.toDataURL('image/jpeg', 0.78)); } catch (e) { resolve(fr.result); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function naoEncontrado(voltar) {
    return `<div class="alert danger">${esc(MSG.naoEncontrado)}</div><a class="btn" href="${voltar}">Voltar</a>`;
  }

  function historicoHtml(im, { comUsuario = true } = {}) {
    const h = (im.historicoPreco || []).slice().sort((a, b) => b.data.localeCompare(a.data));
    if (!h.length) return '<div class="empty">Nenhuma alteração de preço registrada.</div>';
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Data</th><th>De</th><th>Para</th><th>Variação</th>${comUsuario ? '<th>Alterado por</th>' : ''}</tr></thead>
      <tbody>${h.map((x) => {
        const v = x.de ? ((x.para - x.de) / x.de) * 100 : 0;
        const cls = v < 0 ? 'im-down' : v > 0 ? 'im-up' : '';
        return `<tr><td>${HH.dateTime(x.data)}</td><td>${HH.money(x.de)}</td><td><strong>${HH.money(x.para)}</strong></td>
          <td class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%</td>${comUsuario ? `<td>${esc(nomeDe(x.usuarioId))}</td>` : ''}</tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ============================================================
  // Equipe · lista de imóveis (UC02 passo 1, UC03 passo 1)
  // ============================================================
  const listState = { status: 'ativos', q: '' };

  function filtrarLista() {
    const q = norm(listState.q);
    return HH.db.imoveis
      .filter((im) => listState.status === 'todos' || (listState.status === 'ativos' ? im.status !== 'Inativo' : im.status === listState.status))
      .filter((im) => !q || norm([im.codigo, im.titulo, im.cep, HH.onlyDigits(im.cep), im.logradouro, im.numero, im.complemento, im.bairro, im.cidade, im.uf].join(' ')).includes(q))
      .sort((a, b) => b.codigo.localeCompare(a.codigo));
  }

  function linhasLista() {
    const list = filtrarLista();
    if (!list.length) return '<div class="empty">Nenhum imóvel encontrado para o filtro informado.</div>';
    return `<div class="table-wrap"><table class="table im-table">
      <thead><tr><th></th><th>Código</th><th>Título</th><th>Tipo / modalidade</th><th>Valor</th><th>Proprietário</th><th>Status</th><th class="im-actions-col">Ações</th></tr></thead>
      <tbody>${list.map((im) => `<tr>
        <td>${HH.thumb(im, 'sm')}</td>
        <td><strong>${esc(im.codigo)}</strong></td>
        <td><a href="#/imovel/${esc(im.id)}">${esc(im.titulo)}</a><div class="small muted">${esc(enderecoLinha(im))} · ${esc(localLinha(im))}</div></td>
        <td>${esc(im.tipo)}<div class="small muted">${esc(im.modalidade)}</div></td>
        <td>${preco(im)}</td>
        <td>${esc(nomeDe(im.proprietarioId))}</td>
        <td>${HH.badge(im.status)}</td>
        <td class="im-actions-col"><div class="row">
          <a class="btn btn-sm" href="#/imoveis/${esc(im.id)}/editar">Editar</a>
          <button class="btn btn-sm btn-danger" data-im-excluir="${esc(im.id)}" ${im.status === 'Inativo' ? 'disabled title="Imóvel já inativo"' : ''}>Excluir</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  HH.route('#/imoveis', {
    title: 'Imóveis', roles: ['corretor', 'admin'],
    render: () => {
      const c = (s) => HH.db.imoveis.filter((i) => i.status === s).length;
      return `
      <div class="page-head">
        <div><h1>Imóveis ${HH.ucTag(['UC01', 'UC02', 'UC03'])}</h1><p class="sub">Gestão da carteira de imóveis da imobiliária.</p></div>
        <a class="btn btn-primary" href="#/imoveis/novo">+ Novo imóvel</a>
      </div>
      <div class="grid grid-4 im-kpis">
        ${['Disponível', 'Reservado', 'Indisponível', 'Inativo'].map((s) => `<div class="kpi"><div class="label">${esc(s)}</div><div class="value">${c(s)}</div></div>`).join('')}
      </div>
      <div class="card">
        <form class="im-filters" id="im-list-filter" onsubmit="return false">
          <div class="field"><label for="im-q">Pesquisar por código ou endereço</label>
            <input class="input" id="im-q" name="q" type="search" placeholder="Ex.: HH-0001, Av. do Batel, Batel, 80240-000" value="${esc(listState.q)}"></div>
          <div class="field"><label for="im-st">Status</label>
            <select class="input" id="im-st" name="status">
              ${opt('ativos', listState.status, 'Ativos (exceto inativos)')}
              ${STATUS.map((s) => opt(s, listState.status)).join('')}
              ${opt('todos', listState.status, 'Todos')}
            </select></div>
        </form>
        <div id="im-list">${linhasLista()}</div>
      </div>`;
    },
    mount: (root, ctx) => {
      const form = root.querySelector('#im-list-filter');
      const box = root.querySelector('#im-list');
      form.addEventListener('input', () => {
        listState.q = form.q.value; listState.status = form.status.value;
        box.innerHTML = linhasLista();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-im-excluir]');
        if (b) excluirImovel(b.dataset.imExcluir, ctx.user);
      });
    },
  });
  HH.nav({ label: 'Imóveis', href: '#/imoveis', roles: ['corretor', 'admin'], group: 'Imobiliária', order: 10 });

  // ============================================================
  // UC03 – Excluir (inativar) imóvel
  // ============================================================
  async function excluirImovel(id, u) {
    const im = HH.find('imoveis', id);
    if (!im) { HH.toast(MSG.naoEncontrado, 'danger'); return; } // EE3: imóvel não existe
    if (im.status === 'Inativo') { HH.toast('Este imóvel já está inativo.', 'warn'); return; }
    // Pré-condição: Administrador ou Corretor responsável pelo imóvel.
    if (u.perfil !== 'admin' && im.corretorId !== u.id) {
      HH.toast('Somente o administrador ou o corretor responsável pode inativar este imóvel.', 'danger');
      return;
    }
    // Passo 2 / E1 / RN1: vínculos impeditivos.
    const vinc = vinculosImpeditivos(im);
    if (vinc.length) {
      HH.modal({
        title: 'Exclusão não permitida',
        body: `<div class="alert danger">${esc(MSG.vinculo)}</div>
          <p class="small muted">Vínculos encontrados para ${esc(im.codigo)} · ${esc(im.titulo)}:</p>
          <ul class="im-vinculos">${vinc.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`,
        actions: [{ label: 'Voltar à lista', class: 'btn-primary' }],
      });
      return;
    }
    // Passo 3 e 4 (A1: cancelar aborta e permanece na lista).
    const ok = await HH.confirm(MSG.confirmar, { title: `Excluir imóvel ${im.codigo}`, ok: 'Inativar', danger: true });
    if (!ok) { HH.toast('Exclusão cancelada.'); if (!location.hash.startsWith('#/imoveis')) HH.go('#/imoveis'); else HH.render(); return; }
    // Passo 5 / RN1: exclusão lógica.
    HH.update('imoveis', im.id, { status: 'Inativo', inativadoEm: new Date().toISOString(), inativadoPor: u.id });
    HH.notify(im.proprietarioId, `Seu imóvel "${im.titulo}" (${im.codigo}) foi retirado do catálogo (inativado).`, '#/meus-imoveis/' + im.id);
    HH.toast(`Imóvel ${im.codigo} inativado com sucesso.`, 'ok');
    HH.go('#/imoveis');
  }

  // ============================================================
  // UC01 / UC02 – Formulário de imóvel
  // ============================================================
  function formHtml(im, u, novo) {
    const v = im || { tipo: 'Apartamento', modalidade: 'Venda', quartos: '', area: '', fotos: [] };
    const clientes = HH.db.usuarios.filter((x) => x.perfil === 'cliente').sort((a, b) => a.nome.localeCompare(b.nome));
    const addrRO = novo ? 'readonly' : '';
    const req = '<span class="im-req" title="Obrigatório">*</span>';
    return `
    <form class="form" id="im-form" novalidate>
      <div data-im-msg></div>
      ${!clientes.length ? '<div class="alert warn">Nenhum cliente cadastrado. Cadastre o proprietário antes de incluir o imóvel (RN2).</div>' : ''}
      <div class="im-form-grid">
        <div class="stack">
          <div class="card">
            <div class="card-title"><h3>Localização</h3><span class="small muted">API ViaCEP</span></div>
            <div class="im-cols">
              <div class="field im-span-2"><label for="f-cep">CEP ${req}</label>
                <div class="row im-cep-row">
                  <input class="input" id="f-cep" name="cep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${esc(v.cep || '')}">
                  <button type="button" class="btn" data-im-cep>Buscar CEP</button>
                </div>
                <div class="hint" data-im-cep-status>${novo ? 'Informe o CEP para preencher o endereço automaticamente.' : ''}</div>
              </div>
              <div class="field im-span-3"><label for="f-log">Logradouro ${req}</label><input class="input" id="f-log" name="logradouro" data-im-addr ${addrRO} value="${esc(v.logradouro || '')}"></div>
              <div class="field"><label for="f-num">Número ${req}</label><input class="input" id="f-num" name="numero" value="${esc(v.numero || '')}"></div>
              <div class="field im-span-3"><label for="f-comp">Complemento</label><input class="input" id="f-comp" name="complemento" placeholder="Apto, bloco, sala…" value="${esc(v.complemento || '')}"></div>
              <div class="field im-span-3"><label for="f-bai">Bairro ${req}</label><input class="input" id="f-bai" name="bairro" data-im-addr ${addrRO} value="${esc(v.bairro || '')}"></div>
              <div class="field im-span-5"><label for="f-cid">Cidade ${req}</label><input class="input" id="f-cid" name="cidade" data-im-addr ${addrRO} value="${esc(v.cidade || '')}"></div>
              <div class="field"><label for="f-uf">UF ${req}</label><input class="input" id="f-uf" name="uf" maxlength="2" data-im-addr ${addrRO} value="${esc(v.uf || '')}"></div>
            </div>
            ${novo ? '<button type="button" class="btn btn-sm btn-ghost" data-im-manual>Preencher endereço manualmente</button>' : ''}
          </div>

          <div class="card">
            <div class="card-title"><h3>Anúncio e características</h3></div>
            <div class="field"><label for="f-tit">Título do anúncio ${req}</label><input class="input" id="f-tit" name="titulo" maxlength="90" placeholder="Ex.: Apartamento 3 quartos no Batel" value="${esc(v.titulo || '')}"></div>
            <div class="field"><label for="f-desc">Descrição técnica</label><textarea class="input" id="f-desc" name="descricao" rows="4">${esc(v.descricao || '')}</textarea></div>
            <div class="im-cols">
              <div class="field im-span-2"><label for="f-tipo">Tipo ${req}</label><select class="input" id="f-tipo" name="tipo">${TIPOS.map((t) => opt(t, v.tipo)).join('')}</select></div>
              <div class="field im-span-2"><label for="f-mod">Modalidade ${req}</label><select class="input" id="f-mod" name="modalidade">${MODALIDADES.map((t) => opt(t, v.modalidade)).join('')}</select></div>
              <div class="field im-span-2"><label for="f-val">Valor (R$) ${req}</label><input class="input" id="f-val" name="valor" type="number" step="0.01" inputmode="decimal" value="${esc(v.valor ?? '')}">
                <div class="hint" data-im-val-hint>${v.modalidade === 'Aluguel' ? 'Valor mensal do aluguel.' : 'Valor de venda.'}</div></div>
              <div class="field im-span-3"><label for="f-qua">Quartos</label><input class="input" id="f-qua" name="quartos" type="number" min="0" step="1" value="${esc(v.quartos ?? '')}"></div>
              <div class="field im-span-3"><label for="f-are">Área (m²)</label><input class="input" id="f-are" name="area" type="number" min="0" step="1" value="${esc(v.area ?? '')}"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title"><h3>Fotos</h3><span class="small muted">Opcional · várias imagens</span></div>
            <input type="file" accept="image/*" multiple data-im-fotos-input class="input">
            <div class="im-fotos" data-im-fotos></div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-title"><h3>Proprietário ${req}</h3></div>
            <div class="field"><label for="f-prop">Cliente proprietário</label>
              <select class="input" id="f-prop" name="proprietarioId">
                <option value="">Selecione…</option>
                ${clientes.map((c) => opt(c.id, v.proprietarioId, `${c.nome} · ${c.email}`)).join('')}
              </select>
              <div class="hint">O imóvel deve ser vinculado a um proprietário já cadastrado (RN2).</div></div>
          </div>

          ${novo ? '' : `<div class="card">
            <div class="card-title"><h3>Status</h3>${HH.ucTag('UC02 · A1')}</div>
            <div class="field"><label for="f-st">Disponibilidade</label>
              <select class="input" id="f-st" name="status">
                ${['Disponível', 'Reservado', 'Indisponível'].map((s) => opt(s, v.status)).join('')}
                ${v.status === 'Inativo' ? opt('Inativo', v.status, 'Inativo (excluído)') : ''}
              </select>
              <div class="hint">Altere manualmente para "Reservado" ou "Indisponível" quando necessário. O proprietário é notificado.</div></div>
          </div>`}

          <div class="card">
            <div class="card-title"><h3>Corretor responsável</h3><span class="small muted">API CRECI</span></div>
            <div class="row">${HH.avatar(novo ? u : user(v.corretorId) || u)}<div><strong>${esc((novo ? u : user(v.corretorId) || u).nome)}</strong>
              <div class="small muted">CRECI ${esc((novo ? u : user(v.corretorId) || u).creci || '—')}/${esc((novo ? u : user(v.corretorId) || u).creciUf || '—')}</div></div></div>
            ${novo ? '<div class="im-creci" data-im-creci><span class="spinner"></span> Consultando registro no CRECI…</div>' : ''}
          </div>

          <div class="card im-sticky">
            <div class="stack">
              <button type="submit" class="btn btn-primary im-full">${novo ? 'Salvar imóvel' : 'Salvar alterações'}</button>
              <div class="row">
                <button type="button" class="btn im-grow" data-im-reset>${novo ? 'Limpar' : 'Restaurar'}</button>
                <a class="btn im-grow" href="#/imoveis">Cancelar</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>`;
  }

  function mountForm(root, ctx, im) {
    const novo = !im;
    const u = ctx.user;
    const form = root.querySelector('#im-form');
    const msgBox = form.querySelector('[data-im-msg]');
    const cepStatus = form.querySelector('[data-im-cep-status]');
    const fotos = im ? (im.fotos || []).slice() : [];
    const showMsg = (text, type = 'danger') => {
      msgBox.innerHTML = text ? `<div class="alert ${type}">${esc(text)}</div>` : '';
      if (text) msgBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const setCepStatus = (html, cls = '') => { cepStatus.className = 'hint ' + cls; cepStatus.innerHTML = html; };
    const addrFields = () => form.querySelectorAll('[data-im-addr]');
    const unlockAddr = () => addrFields().forEach((el) => { el.readOnly = false; });

    // ---- CEP / ViaCEP (UC01 passo 4, A1, E1) ----
    let lastCep = HH.onlyDigits(form.cep.value);
    let seq = 0;
    async function buscarCep() {
      const d = HH.onlyDigits(form.cep.value);
      if (d.length !== 8) { setCepStatus('Informe os 8 dígitos do CEP.', 'im-warn'); return; }
      lastCep = d;
      const my = ++seq;
      setCepStatus('<span class="spinner"></span> Consultando ViaCEP…');
      try {
        const r = await HH.api.viaCep(d);
        if (my !== seq) return;
        if (!r) {
          // A1: CEP não localizado → digitação manual.
          unlockAddr();
          setCepStatus(esc(MSG.cepNaoEncontrado), 'im-warn');
          form.logradouro.focus();
          return;
        }
        showMsg('');
        const map = { logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.uf };
        Object.entries(map).forEach(([k, val]) => {
          const el = form.elements[k];
          el.value = val || '';
          el.readOnly = !!val; // campos que o ViaCEP não trouxe ficam liberados
          el.classList.remove('invalid');
        });
        setCepStatus('✓ Endereço preenchido automaticamente pelo ViaCEP.', 'im-ok');
        form.numero.focus();
      } catch (e) {
        if (my !== seq) return;
        // E1: serviço indisponível → alerta e campos liberados.
        unlockAddr();
        showMsg(e.message || MSG.cepFora, 'warn');
        setCepStatus(esc(e.message || MSG.cepFora), 'im-warn');
        HH.toast(e.message || MSG.cepFora, 'warn');
        form.logradouro.focus();
      }
    }
    form.cep.addEventListener('input', () => {
      form.cep.value = formatCep(form.cep.value);
      const d = HH.onlyDigits(form.cep.value);
      if (d.length === 8 && d !== lastCep) buscarCep();
    });
    form.cep.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCep(); } });
    form.querySelector('[data-im-cep]').addEventListener('click', buscarCep);
    const manual = form.querySelector('[data-im-manual]');
    if (manual) manual.addEventListener('click', () => { unlockAddr(); setCepStatus('Preenchimento manual habilitado.'); form.logradouro.focus(); });
    form.uf.addEventListener('input', () => { form.uf.value = form.uf.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    form.modalidade.addEventListener('change', () => {
      form.querySelector('[data-im-val-hint]').textContent = form.modalidade.value === 'Aluguel' ? 'Valor mensal do aluguel.' : 'Valor de venda.';
    });

    // ---- CRECI informativo ao abrir (UC01 passo 5). A validação que bloqueia ocorre ao salvar. ----
    const creciBox = form.querySelector('[data-im-creci]');
    if (creciBox) {
      HH.api.creci(u.creci, u.creciUf, u.nome)
        .then((r) => { creciBox.className = 'im-creci im-ok'; creciBox.textContent = `✓ Registro ${r.numero}/${r.uf} ativo.`; })
        .catch((e) => { creciBox.className = 'im-creci im-bad'; creciBox.textContent = e.message; });
    }

    // ---- Fotos (FileReader → dataURL) ----
    const fotosBox = form.querySelector('[data-im-fotos]');
    const renderFotos = () => {
      fotosBox.innerHTML = fotos.length
        ? fotos.map((src, i) => `<div class="im-foto"><img src="${esc(src)}" alt="Foto ${i + 1}">${i === 0 ? '<span class="im-capa">Capa</span>' : ''}
            <div class="im-foto-acts">${i > 0 ? `<button type="button" class="btn btn-sm" data-im-capa="${i}" title="Usar como capa">★</button>` : ''}
            <button type="button" class="btn btn-sm" data-im-rm="${i}" title="Remover">✕</button></div></div>`).join('')
        : '<div class="small muted">Nenhuma foto adicionada.</div>';
    };
    renderFotos();
    form.querySelector('[data-im-fotos-input]').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
      e.target.value = '';
      for (const f of files) {
        try { fotos.push(await lerFoto(f)); } catch (err) { HH.toast(err.message, 'danger'); }
      }
      renderFotos();
    });
    fotosBox.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-im-rm]');
      const capa = e.target.closest('[data-im-capa]');
      if (rm) { fotos.splice(Number(rm.dataset.imRm), 1); renderFotos(); }
      if (capa) { const [f] = fotos.splice(Number(capa.dataset.imCapa), 1); fotos.unshift(f); renderFotos(); }
    });

    // ---- Limpar / Restaurar ----
    form.querySelector('[data-im-reset]').addEventListener('click', () => HH.render());

    // ---- Salvar (UC01 passos 6-8 / UC02 passos 5-7) ----
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const d = HH.formData(form);
      showMsg('');

      // E3 (UC01): obrigatórios – Endereço, Valor e Proprietário (+ dados do anúncio).
      const obrig = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'valor', 'proprietarioId', 'titulo', 'tipo', 'modalidade'];
      const faltando = obrig.filter((k) => !d[k]);
      if (d.cep && HH.onlyDigits(d.cep).length !== 8) faltando.push('cep');
      // RN2: proprietário existente na base.
      const prop = d.proprietarioId ? user(d.proprietarioId) : null;
      if (d.proprietarioId && !prop) faltando.push('proprietarioId');
      HH.markInvalid(form, faltando);
      if (faltando.length) { showMsg(MSG.obrigatorios); HH.toast(MSG.obrigatorios, 'danger'); return; }

      // UC02 E1 (aplicado também na inclusão): valor > 0.
      const valor = Number(String(d.valor).replace(',', '.'));
      if (!(valor > 0)) { HH.markInvalid(form, ['valor']); showMsg(MSG.valor); HH.toast(MSG.valor, 'danger'); return; }

      const dados = {
        titulo: d.titulo, descricao: d.descricao, tipo: d.tipo, modalidade: d.modalidade, valor,
        cep: formatCep(d.cep), logradouro: d.logradouro, numero: d.numero, complemento: d.complemento,
        bairro: d.bairro, cidade: d.cidade, uf: d.uf.toUpperCase(),
        quartos: Math.max(0, parseInt(d.quartos, 10) || 0), area: Math.max(0, Number(d.area) || 0),
        proprietarioId: d.proprietarioId, fotos: fotos.slice(),
      };

      if (novo) {
        // E2 / RN1: CRECI ativo no momento do cadastro.
        try {
          await HH.busy(btn, HH.api.creci(u.creci, u.creciUf, u.nome));
        } catch (err) {
          const m = err.message || MSG.creci;
          showMsg(m); HH.toast(m, 'danger');
          if (creciBox) { creciBox.className = 'im-creci im-bad'; creciBox.textContent = m; }
          return;
        }
        const now = new Date().toISOString();
        const novoIm = {
          id: HH.uid('i'), codigo: HH.nextCodigo('imovel'), ...dados,
          corretorId: u.id, status: 'Disponível', historicoPreco: [], cor: Math.floor(Math.random() * 6), criadoEm: now,
        };
        try { HH.insert('imoveis', novoIm); } catch (err) { showMsg('Não foi possível gravar o imóvel: ' + err.message); return; }
        HH.notify(novoIm.proprietarioId, `Seu imóvel "${novoIm.titulo}" foi anunciado no HabitaHub com o código ${novoIm.codigo}.`, '#/meus-imoveis/' + novoIm.id);
        HH.toast(`Imóvel cadastrado com sucesso. Código de referência: ${novoIm.codigo}.`, 'ok');
        HH.go('#/imoveis');
        return;
      }

      // ---- UC02: alteração ----
      const now = new Date().toISOString();
      const mudancas = [];
      if (valor !== Number(im.valor)) {
        // RN1: histórico de auditoria de preço.
        im.historicoPreco = (im.historicoPreco || []).concat({ data: now, de: Number(im.valor), para: valor, usuarioId: u.id });
        mudancas.push(`preço alterado de ${HH.money(im.valor)} para ${HH.money(valor)}`);
      }
      const novoStatus = d.status || im.status;
      if (novoStatus !== im.status) mudancas.push(`status alterado de "${im.status}" para "${novoStatus}"`);
      const propAnterior = im.proprietarioId;
      Object.assign(im, dados, { status: novoStatus, atualizadoEm: now, atualizadoPor: u.id });
      HH.save();
      if (mudancas.length) {
        HH.notify(im.proprietarioId, `Seu imóvel "${im.titulo}" (${im.codigo}): ${mudancas.join(' e ')}.`, '#/meus-imoveis/' + im.id);
      }
      if (propAnterior !== im.proprietarioId) {
        HH.notify(im.proprietarioId, `O imóvel "${im.titulo}" (${im.codigo}) foi vinculado a você como proprietário.`, '#/meus-imoveis/' + im.id);
      }
      HH.toast('Alterações salvas com sucesso.', 'ok');
      HH.go('#/imoveis');
    });
  }

  HH.route('#/imoveis/novo', {
    title: 'Novo imóvel', roles: ['corretor', 'admin'],
    render: ({ user: u }) => `
      <div class="page-head">
        <div><h1>Novo imóvel ${HH.ucTag('UC01')}</h1><p class="sub">Cadastre um imóvel e vincule-o a um proprietário. Ele entra no catálogo com status "Disponível".</p></div>
        <a class="btn" href="#/imoveis">← Voltar</a>
      </div>
      ${formHtml(null, u, true)}`,
    mount: (root, ctx) => mountForm(root, ctx, null),
  });

  HH.route('#/imoveis/:id/editar', {
    title: 'Editar imóvel', roles: ['corretor', 'admin'],
    render: ({ params, user: u }) => {
      const im = HH.find('imoveis', params.id);
      if (!im) return `<div class="page-head"><h1>Editar imóvel ${HH.ucTag('UC02')}</h1></div>${naoEncontrado('#/imoveis')}`;
      return `
      <div class="page-head">
        <div><h1>Editar ${esc(im.codigo)} ${HH.ucTag('UC02')}</h1><p class="sub">${esc(im.titulo)} · ${HH.badge(im.status)} · cadastrado em ${HH.date(im.criadoEm)}</p></div>
        <div class="row"><a class="btn" href="#/imovel/${esc(im.id)}">Ver anúncio</a><a class="btn" href="#/imoveis">← Voltar</a></div>
      </div>
      ${im.status === 'Inativo' ? '<div class="alert warn">Este imóvel está inativo e não aparece nas buscas públicas. Altere o status para reativá-lo.</div>' : ''}
      ${formHtml(im, u, false)}
      <div class="card im-hist">
        <div class="card-title"><h3>Histórico de preço (auditoria) ${HH.ucTag('UC02 · RN1')}</h3></div>
        ${historicoHtml(im)}
      </div>`;
    },
    mount: (root, ctx) => {
      const im = HH.find('imoveis', ctx.params.id);
      if (im) mountForm(root, ctx, im);
    },
  });

  // ============================================================
  // Cliente · catálogo
  // ============================================================
  const catState = { tipo: '', modalidade: '', local: '', min: '', max: '', quartos: '', ordem: 'recentes' };

  function filtrarCatalogo() {
    const s = catState;
    const loc = norm(s.local);
    const min = s.min === '' ? null : Number(s.min);
    const max = s.max === '' ? null : Number(s.max);
    const list = HH.db.imoveis.filter((im) => im.status === 'Disponível'
      && (!s.tipo || im.tipo === s.tipo)
      && (!s.modalidade || im.modalidade === s.modalidade)
      && (!loc || norm([im.bairro, im.cidade, im.uf, im.logradouro].join(' ')).includes(loc))
      && (min == null || im.valor >= min)
      && (max == null || im.valor <= max)
      && (!s.quartos || Number(im.quartos) >= Number(s.quartos)));
    const ord = {
      recentes: (a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)),
      menor: (a, b) => a.valor - b.valor,
      maior: (a, b) => b.valor - a.valor,
    }[s.ordem] || (() => 0);
    return list.sort(ord);
  }

  function cardImovel(im) {
    const av = mediaImovel(im.id);
    return `<a class="im-card card" href="#/imovel/${esc(im.id)}">
      ${HH.thumb(im)}
      <div class="im-card-body">
        <div class="row between"><span class="badge primary">${esc(im.modalidade)}</span><span class="small muted">${esc(im.tipo)} · ${esc(im.codigo)}</span></div>
        <h3>${esc(im.titulo)}</h3>
        <div class="small muted">${esc(localLinha(im))}</div>
        <div class="im-price">${preco(im)}</div>
        <div class="row small muted im-feats"><span>${esc(quartosTxt(im.quartos))}</span><span>·</span><span>${esc(im.area)} m²</span>
          ${av.n ? `<span>·</span>${HH.stars(av.media)}` : ''}</div>
      </div>
    </a>`;
  }

  function gradeCatalogo() {
    const list = filtrarCatalogo();
    if (!list.length) {
      return `<div class="empty"><strong>Nenhum imóvel encontrado.</strong><br>Tente ampliar a faixa de preço, mudar a cidade ou limpar os filtros.
        <div style="margin-top:12px"><button class="btn btn-sm" data-im-limpar>Limpar filtros</button></div></div>`;
    }
    return `<p class="small muted">${list.length} ${list.length === 1 ? 'imóvel disponível' : 'imóveis disponíveis'}</p>
      <div class="im-grid">${list.map(cardImovel).join('')}</div>`;
  }

  HH.route('#/catalogo', {
    title: 'Catálogo',
    render: () => {
      const s = catState;
      return `
      <div class="page-head">
        <div><h1>Catálogo de imóveis</h1><p class="sub">Encontre o imóvel ideal para comprar ou alugar.</p></div>
      </div>
      <div class="card im-cat-filters">
        <form class="im-filters im-filters-cat" id="im-cat-filter" onsubmit="return false">
          <div class="field"><label for="c-loc">Cidade ou bairro</label><input class="input" id="c-loc" name="local" type="search" placeholder="Ex.: Batel, Curitiba" value="${esc(s.local)}"></div>
          <div class="field"><label for="c-tipo">Tipo</label><select class="input" id="c-tipo" name="tipo">${opt('', s.tipo, 'Todos')}${TIPOS.map((t) => opt(t, s.tipo)).join('')}</select></div>
          <div class="field"><label for="c-mod">Modalidade</label><select class="input" id="c-mod" name="modalidade">${opt('', s.modalidade, 'Venda e aluguel')}${MODALIDADES.map((t) => opt(t, s.modalidade)).join('')}</select></div>
          <div class="field"><label for="c-min">Preço mínimo (R$)</label><input class="input" id="c-min" name="min" type="number" min="0" step="100" value="${esc(s.min)}"></div>
          <div class="field"><label for="c-max">Preço máximo (R$)</label><input class="input" id="c-max" name="max" type="number" min="0" step="100" value="${esc(s.max)}"></div>
          <div class="field"><label for="c-qua">Quartos (mín.)</label><select class="input" id="c-qua" name="quartos">${opt('', s.quartos, 'Qualquer')}${[1, 2, 3, 4].map((n) => opt(n, s.quartos, n + '+')).join('')}</select></div>
          <div class="field"><label for="c-ord">Ordenar por</label><select class="input" id="c-ord" name="ordem">${opt('recentes', s.ordem, 'Mais recentes')}${opt('menor', s.ordem, 'Menor preço')}${opt('maior', s.ordem, 'Maior preço')}</select></div>
        </form>
      </div>
      <div id="im-cat">${gradeCatalogo()}</div>`;
    },
    mount: (root) => {
      const form = root.querySelector('#im-cat-filter');
      const box = root.querySelector('#im-cat');
      const sync = () => { Object.keys(catState).forEach((k) => { if (form.elements[k]) catState[k] = form.elements[k].value.trim(); }); box.innerHTML = gradeCatalogo(); };
      form.addEventListener('input', sync);
      form.addEventListener('change', sync);
      box.addEventListener('click', (e) => {
        if (!e.target.closest('[data-im-limpar]')) return;
        Object.assign(catState, { tipo: '', modalidade: '', local: '', min: '', max: '', quartos: '', ordem: 'recentes' });
        HH.render();
      });
    },
  });
  HH.nav({ label: 'Catálogo', href: '#/catalogo', roles: ['cliente'], group: 'Cliente', order: 10 });

  // ============================================================
  // Detalhe do imóvel (qualquer usuário logado)
  // ============================================================
  HH.route('#/imovel/:id', {
    title: 'Imóvel',
    render: ({ params, user: u }) => {
      const im = HH.find('imoveis', params.id);
      const staff = HH.isStaff(u);
      const dono = im && im.proprietarioId === u.id;
      // Inativos saem das buscas públicas (UC03 pós-condição): só equipe e proprietário veem.
      if (!im || (im.status === 'Inativo' && !staff && !dono)) {
        return `<div class="alert danger">Imóvel não encontrado ou não está mais disponível.</div><a class="btn" href="#/catalogo">← Voltar ao catálogo</a>`;
      }
      const cor = user(im.corretorId);
      const av = mediaImovel(im.id);
      const fotos = im.fotos || [];
      const ctx = { imovel: im, user: u };
      const acoes = HH.renderSlot('imovel.detalhe.acoes', ctx);
      return `
      <div class="page-head">
        <div><a class="small" href="${staff ? '#/imoveis' : '#/catalogo'}">← ${staff ? 'Imóveis' : 'Catálogo'}</a>
          <h1>${esc(im.titulo)}</h1>
          <p class="sub">${esc(im.codigo)} · ${esc(localLinha(im))}</p></div>
        <div class="row">${HH.badge(im.status)}
          ${staff ? `<a class="btn btn-sm" href="#/imoveis/${esc(im.id)}/editar">Editar</a>` : ''}
          ${dono ? `<a class="btn btn-sm" href="#/meus-imoveis/${esc(im.id)}">Painel do proprietário</a>` : ''}</div>
      </div>
      ${im.status !== 'Disponível' ? `<div class="alert warn">Este imóvel está com status <strong>${esc(im.status)}</strong> e não aceita novas visitas ou propostas no momento.</div>` : ''}
      <div class="im-detail">
        <div class="stack">
          <div class="im-gallery">
            <div class="im-gallery-main" data-im-main>${fotos.length ? `<img src="${esc(fotos[0])}" alt="${esc(im.titulo)}">` : HH.thumb(im)}</div>
            ${fotos.length > 1 ? `<div class="im-gallery-thumbs">${fotos.map((f, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-im-foto="${i}"><img src="${esc(f)}" alt="Foto ${i + 1}"></button>`).join('')}</div>` : ''}
          </div>
          <div class="card">
            <div class="card-title"><h3>Características</h3></div>
            <div class="im-specs">
              <div><span class="muted small">Tipo</span><strong>${esc(im.tipo)}</strong></div>
              <div><span class="muted small">Modalidade</span><strong>${esc(im.modalidade)}</strong></div>
              <div><span class="muted small">Quartos</span><strong>${esc(im.quartos)}</strong></div>
              <div><span class="muted small">Área</span><strong>${esc(im.area)} m²</strong></div>
            </div>
            ${im.descricao ? `<p class="im-desc">${esc(im.descricao)}</p>` : ''}
          </div>
          <div class="card">
            <div class="card-title"><h3>Endereço</h3></div>
            <p style="margin:0">${esc(enderecoLinha(im))}<br>${esc(localLinha(im))}<br><span class="muted">CEP ${esc(im.cep)}</span></p>
          </div>
        </div>
        <div class="stack">
          <div class="card im-buy">
            <div class="muted small">${im.modalidade === 'Aluguel' ? 'Aluguel mensal' : 'Valor de venda'}</div>
            <div class="im-price im-price-lg">${preco(im)}</div>
            <div class="im-acoes" data-im-acoes>${acoes || '<div class="small muted">Nenhuma ação disponível.</div>'}</div>
          </div>
          <div class="card">
            <div class="card-title"><h3>Avaliação do imóvel</h3></div>
            ${av.n ? `<div class="row"><span class="im-rate">${av.media.toFixed(1).replace('.', ',')}</span>${HH.stars(av.media)}</div><div class="small muted">${av.n} ${av.n === 1 ? 'avaliação' : 'avaliações'} de visitantes</div>`
              : '<div class="small muted">Ainda sem avaliações de visitantes.</div>'}
          </div>
          <div class="card">
            <div class="card-title"><h3>Corretor responsável</h3></div>
            ${cor ? `<div class="row">${HH.avatar(cor)}<div><strong>${esc(cor.nome)}</strong><div class="small muted">CRECI ${esc(cor.creci || '—')}/${esc(cor.creciUf || '')}</div>
              <div class="small">${esc(cor.telefone || '')}${cor.email ? ` · ${esc(cor.email)}` : ''}</div></div></div>` : '<div class="small muted">—</div>'}
          </div>
        </div>
      </div>`;
    },
    mount: (root, ctx) => {
      const im = HH.find('imoveis', ctx.params.id);
      if (!im) return;
      const main = root.querySelector('[data-im-main]');
      root.querySelectorAll('[data-im-foto]').forEach((b) => b.addEventListener('click', () => {
        const src = (im.fotos || [])[Number(b.dataset.imFoto)];
        if (!src || !main) return;
        main.innerHTML = `<img src="${esc(src)}" alt="${esc(im.titulo)}">`;
        root.querySelectorAll('[data-im-foto]').forEach((x) => x.classList.toggle('active', x === b));
      }));
      const acoes = root.querySelector('[data-im-acoes]');
      if (acoes) HH.mountSlot('imovel.detalhe.acoes', acoes, { imovel: im, user: ctx.user });
    },
  });

  // ============================================================
  // Proprietário · Meus imóveis
  // ============================================================
  const contadores = (im) => ({
    visitas: HH.where('visitas', (v) => v.imovelId === im.id && v.status !== 'Cancelada').length,
    realizadas: HH.where('visitas', (v) => v.imovelId === im.id && v.status === 'Realizada').length,
    propostas: HH.where('propostas', (p) => p.imovelId === im.id).length,
    abertas: HH.where('propostas', (p) => p.imovelId === im.id && ['Em Análise', 'Contraproposta'].includes(p.status)).length,
  });

  HH.route('#/meus-imoveis', {
    title: 'Meus imóveis', roles: ['cliente'],
    render: ({ user: u }) => {
      const list = HH.where('imoveis', (i) => i.proprietarioId === u.id).sort((a, b) => a.codigo.localeCompare(b.codigo));
      const head = `<div class="page-head"><div><h1>Meus imóveis</h1><p class="sub">Acompanhe em tempo real o que acontece com os imóveis que você anunciou conosco.</p></div></div>`;
      if (!list.length) {
        return `${head}<div class="empty"><strong>Você ainda não tem imóveis anunciados.</strong><br>
          Quando um corretor da HabitaHub cadastrar um imóvel em seu nome, ele aparecerá aqui com visitas, feedbacks, propostas e contratos.
          <div style="margin-top:12px"><a class="btn btn-sm" href="#/catalogo">Ver catálogo</a></div></div>`;
      }
      return `${head}<div class="im-owner-list">${list.map((im) => {
        const c = contadores(im);
        return `<a class="card im-owner-item" href="#/meus-imoveis/${esc(im.id)}">
          ${HH.thumb(im, 'sm')}
          <div class="im-owner-main"><div class="row"><strong>${esc(im.titulo)}</strong>${HH.badge(im.status)}</div>
            <div class="small muted">${esc(im.codigo)} · ${esc(localLinha(im))} · ${preco(im)}</div></div>
          <div class="im-counters">
            <div><strong>${c.visitas}</strong><span class="small muted">visitas</span></div>
            <div><strong>${c.propostas}</strong><span class="small muted">propostas</span></div>
            ${c.abertas ? `<span class="badge warn">${c.abertas} em aberto</span>` : ''}
          </div>
        </a>`;
      }).join('')}</div>`;
    },
  });
  HH.nav({ label: 'Meus imóveis', href: '#/meus-imoveis', roles: ['cliente'], group: 'Cliente', order: 40 });

  HH.route('#/meus-imoveis/:id', {
    title: 'Painel do proprietário', roles: ['cliente'],
    render: ({ params, user: u }) => {
      const im = HH.find('imoveis', params.id);
      if (!im || im.proprietarioId !== u.id) {
        return `<div class="alert danger">Acesso restrito: este painel está disponível apenas para o proprietário do imóvel.</div><a class="btn" href="#/meus-imoveis">← Meus imóveis</a>`;
      }
      const c = contadores(im);
      const av = mediaImovel(im.id);
      const cor = user(im.corretorId);
      const slot = HH.renderSlot('proprietario.imovel', { imovel: im, user: u });
      const ultimo = (im.historicoPreco || []).slice().sort((a, b) => b.data.localeCompare(a.data))[0];
      return `
      <div class="page-head">
        <div><a class="small" href="#/meus-imoveis">← Meus imóveis</a><h1>Painel do proprietário</h1><p class="sub">Tudo o que acontece com o seu imóvel, em um só lugar.</p></div>
      </div>
      <div class="card im-owner-head">
        ${HH.thumb(im)}
        <div>
          <div class="row">${HH.badge(im.status)}<span class="small muted">${esc(im.codigo)} · anunciado em ${HH.date(im.criadoEm)}</span></div>
          <h2>${esc(im.titulo)}</h2>
          <div class="muted">${esc(enderecoLinha(im))} · ${esc(localLinha(im))}</div>
          <div class="im-price im-price-lg">${preco(im)}</div>
          ${ultimo ? `<div class="small muted">Último ajuste de preço em ${HH.date(ultimo.data)} (antes ${HH.money(ultimo.de)}).</div>` : ''}
          <div class="row" style="margin-top:8px">
            <a class="btn btn-sm" href="#/imovel/${esc(im.id)}">Ver anúncio</a>
            ${cor ? `<span class="small muted">Corretor: <strong>${esc(cor.nome)}</strong> · ${esc(cor.telefone || '')}</span>` : ''}
          </div>
        </div>
      </div>
      ${im.status === 'Inativo' ? '<div class="alert warn" style="margin-top:16px">Este imóvel foi inativado e não aparece mais no catálogo.</div>' : ''}
      <div class="grid grid-4" style="margin-top:16px">
        <div class="kpi"><div class="label">Visitas</div><div class="value">${c.visitas}</div><div class="small muted">${c.realizadas} realizadas</div></div>
        <div class="kpi"><div class="label">Propostas</div><div class="value">${c.propostas}</div><div class="small muted">${c.abertas} em aberto</div></div>
        <div class="kpi"><div class="label">Avaliação dos visitantes</div><div class="value">${av.n ? av.media.toFixed(1).replace('.', ',') : '—'}</div>${av.n ? HH.stars(av.media) : '<div class="small muted">sem avaliações</div>'}</div>
        <div class="kpi"><div class="label">Ajustes de preço</div><div class="value">${(im.historicoPreco || []).length}</div></div>
      </div>
      <div class="im-owner-slot" data-im-owner-slot>
        ${slot || '<div class="card"><div class="empty">Ainda não há visitas, propostas ou contratos para este imóvel. Você será notificado assim que houver novidades.</div></div>'}
      </div>
      <div class="card">
        <div class="card-title"><h3>Histórico de preço</h3></div>
        ${historicoHtml(im, { comUsuario: false })}
      </div>`;
    },
    mount: (root, ctx) => {
      const im = HH.find('imoveis', ctx.params.id);
      if (!im || im.proprietarioId !== ctx.user.id) return;
      const box = root.querySelector('[data-im-owner-slot]');
      if (box) HH.mountSlot('proprietario.imovel', box, { imovel: im, user: ctx.user });
    },
  });

  // ============================================================
  // Slot do painel da equipe: imóveis reservados há mais de 30 dias
  // ============================================================
  HH.slot('painel.pendencias', {
    order: 10,
    render: ({ user: u }) => {
      if (!HH.isStaff(u)) return '';
      const limite = Date.now() - 30 * HH.DAY;
      return HH.db.imoveis.filter((im) => im.status === 'Reservado').map((im) => {
        // Data da reserva: último pagamento confirmado de uma proposta do imóvel (ou atualização manual).
        const pags = HH.db.pagamentos.filter((g) => g.status === 'Pago' && (HH.find('propostas', g.propostaId) || {}).imovelId === im.id).map((g) => g.data);
        const desde = pags.sort().pop() || im.atualizadoEm || null;
        if (!desde || new Date(desde).getTime() > limite) return '';
        const dias = Math.floor((Date.now() - new Date(desde).getTime()) / HH.DAY);
        return `<li><div><a href="#/imoveis/${esc(im.id)}/editar">${esc(im.codigo)} · ${esc(im.titulo)}</a> está reservado há ${dias} dias.</div><div class="when">Reservado desde ${HH.date(desde)}</div></li>`;
      }).join('');
    },
  });
})();
