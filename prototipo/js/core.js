/* HabitaHub – núcleo do protótipo.
 * Expõe o namespace global HH: banco em localStorage, sessão, roteador,
 * navegação, notificações e utilitários de UI. Todos os módulos usam só esta API.
 */
window.HH = (function () {
  'use strict';

  const KEY = 'habitahub.proto.v1';
  const DAY = 86400000;

  // ---------- Utilitários ----------
  const uid = (prefix) => prefix + '_' + Math.random().toString(36).slice(2, 9);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
  const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

  // Hash não criptográfico (djb2) – suficiente para protótipo, NÃO usar em produção.
  function hash(str) {
    let h = 5381;
    for (const ch of String(str)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
    return 'h' + h.toString(16);
  }

  function validaCPF(cpf) {
    const d = onlyDigits(cpf);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const calc = (len) => {
      let s = 0;
      for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
      return ((s * 10) % 11) % 10;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  const formatCPF = (cpf) => onlyDigits(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  // Senha forte: 8+ caracteres, com letra e número (UC05 E2).
  const senhaForte = (s) => typeof s === 'string' && s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);

  // ---------- Dados de demonstração ----------
  function seed() {
    const now = Date.now();
    const at = (days, hour = 10) => { const d = new Date(now + days * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
    const senha = hash('demo1234');
    const pref = { emailMarketing: false, whatsapp: true, alertaNovos: true };

    const usuarios = [
      { id: 'u_corretor', nome: 'Carla Mendes', email: 'carla@habitahub.demo', cpf: '52998224725', telefone: '(41) 99811-2233', cep: '80010-000', endereco: 'Centro, Curitiba/PR', senha, perfil: 'corretor', creci: '12345-F', creciUf: 'PR', prefs: { ...pref }, foto: null, criadoEm: at(-200) },
      { id: 'u_admin', nome: 'Administração HabitaHub', email: 'admin@habitahub.demo', cpf: '12345678909', telefone: '(41) 3333-4444', cep: '80010-000', endereco: 'Centro, Curitiba/PR', senha, perfil: 'admin', creci: '00001-J', creciUf: 'PR', prefs: { ...pref }, foto: null, criadoEm: at(-300) },
      { id: 'u_joao', nome: 'João Ribeiro', email: 'joao@habitahub.demo', cpf: '11144477735', telefone: '(41) 98877-6655', cep: '81570-000', endereco: 'Uberaba, Curitiba/PR', senha, perfil: 'cliente', prefs: { ...pref }, foto: null, criadoEm: at(-120) },
      { id: 'u_mariana', nome: 'Mariana Souza', email: 'mariana@habitahub.demo', cpf: '00000000191', telefone: '(41) 99700-1122', cep: '80240-000', endereco: 'Batel, Curitiba/PR', senha, perfil: 'cliente', prefs: { ...pref }, foto: null, criadoEm: at(-40) },
      { id: 'u_paulo', nome: 'Paulo Lima', email: 'paulo@habitahub.demo', cpf: '98765432100', telefone: '(41) 99655-4433', cep: '80730-000', endereco: 'Bigorrilho, Curitiba/PR', senha, perfil: 'cliente', prefs: { ...pref }, foto: null, criadoEm: at(-90) },
    ];

    const im = (o) => ({ fotos: [], historicoPreco: [], corretorId: 'u_corretor', complemento: '', criadoEm: at(-60), ...o });
    const imoveis = [
      im({ id: 'i_1', codigo: 'HH-0001', titulo: 'Apartamento 3 quartos no Batel', descricao: 'Apartamento amplo com sacada, 2 vagas e lazer completo.', tipo: 'Apartamento', modalidade: 'Venda', valor: 890000, cep: '80240-000', logradouro: 'Av. do Batel', numero: '1500', bairro: 'Batel', cidade: 'Curitiba', uf: 'PR', quartos: 3, area: 118, proprietarioId: 'u_joao', status: 'Disponível', cor: 0,
        historicoPreco: [{ data: at(-30), de: 920000, para: 890000, usuarioId: 'u_corretor' }] }),
      im({ id: 'i_2', codigo: 'HH-0002', titulo: 'Casa com quintal no Uberaba', descricao: 'Casa térrea, 3 quartos, churrasqueira e quintal gramado.', tipo: 'Casa', modalidade: 'Venda', valor: 650000, cep: '81570-000', logradouro: 'Rua das Palmeiras', numero: '980', bairro: 'Uberaba', cidade: 'Curitiba', uf: 'PR', quartos: 3, area: 160, proprietarioId: 'u_joao', status: 'Disponível', cor: 1 }),
      im({ id: 'i_3', codigo: 'HH-0003', titulo: 'Studio mobiliado no Centro', descricao: 'Studio mobiliado próximo à Rua XV, ideal para estudantes.', tipo: 'Studio', modalidade: 'Aluguel', valor: 1900, cep: '80010-000', logradouro: 'Rua XV de Novembro', numero: '300', complemento: 'Apto 804', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', quartos: 1, area: 32, proprietarioId: 'u_joao', status: 'Reservado', cor: 2 }),
      im({ id: 'i_4', codigo: 'HH-0004', titulo: 'Sobrado no Bigorrilho', descricao: 'Sobrado com 4 suítes, escritório e garagem para 3 carros.', tipo: 'Sobrado', modalidade: 'Venda', valor: 1450000, cep: '80730-000', logradouro: 'Rua Padre Anchieta', numero: '2100', bairro: 'Bigorrilho', cidade: 'Curitiba', uf: 'PR', quartos: 4, area: 280, proprietarioId: 'u_paulo', status: 'Reservado', cor: 3 }),
      im({ id: 'i_5', codigo: 'HH-0005', titulo: 'Apartamento 2 quartos no Água Verde', descricao: 'Reformado, cozinha planejada, próximo a parques.', tipo: 'Apartamento', modalidade: 'Aluguel', valor: 2800, cep: '80620-000', logradouro: 'Av. República Argentina', numero: '1200', complemento: 'Apto 51', bairro: 'Água Verde', cidade: 'Curitiba', uf: 'PR', quartos: 2, area: 68, proprietarioId: 'u_paulo', status: 'Disponível', cor: 4 }),
      im({ id: 'i_6', codigo: 'HH-0006', titulo: 'Sala comercial no Cabral', descricao: 'Sala com recepção, 2 banheiros e vaga.', tipo: 'Comercial', modalidade: 'Aluguel', valor: 3500, cep: '80035-000', logradouro: 'Av. Paraná', numero: '450', bairro: 'Cabral', cidade: 'Curitiba', uf: 'PR', quartos: 0, area: 55, proprietarioId: 'u_paulo', status: 'Disponível', cor: 5 }),
    ];

    const visitas = [
      { id: 'v_1', imovelId: 'i_1', clienteId: 'u_mariana', corretorId: 'u_corretor', dataHora: at(-10, 14), status: 'Realizada', obs: 'Gostaria de ver a vaga de garagem.', feedback: 'Cliente gostou muito da planta e da sacada; achou o condomínio alto.', criadoEm: at(-14) },
      { id: 'v_2', imovelId: 'i_2', clienteId: 'u_mariana', corretorId: 'u_corretor', dataHora: at(3, 10), status: 'Agendada', obs: '', feedback: '', criadoEm: at(-1) },
      { id: 'v_3', imovelId: 'i_5', clienteId: 'u_mariana', corretorId: 'u_corretor', dataHora: at(-5, 16), status: 'Realizada', obs: '', feedback: 'Cliente achou o apartamento pequeno para a família.', criadoEm: at(-8) },
      { id: 'v_4', imovelId: 'i_3', clienteId: 'u_paulo', corretorId: 'u_corretor', dataHora: at(-20, 11), status: 'Realizada', obs: '', feedback: 'Visita tranquila, cliente decidiu fazer proposta.', criadoEm: at(-22) },
    ];

    const propostas = [
      { id: 'p_1', imovelId: 'i_1', clienteId: 'u_mariana', valor: 850000, pagamento: 'Financiamento', obs: 'Tenho carta de crédito pré-aprovada.', cartaCredito: true, status: 'Em Análise', contraproposta: null, historico: [], data: at(-2) },
      { id: 'p_2', imovelId: 'i_5', clienteId: 'u_joao', valor: 2600, pagamento: 'À vista', obs: '', cartaCredito: false, status: 'Aprovada', contraproposta: null, historico: [{ data: at(-1), texto: 'Proposta aprovada pela imobiliária.' }], data: at(-4) },
      { id: 'p_3', imovelId: 'i_3', clienteId: 'u_paulo', valor: 1850, pagamento: 'À vista', obs: '', cartaCredito: false, status: 'Aprovada', contraproposta: null, historico: [{ data: at(-15), texto: 'Proposta aprovada pela imobiliária.' }], data: at(-18) },
      { id: 'p_4', imovelId: 'i_4', clienteId: 'u_mariana', valor: 1400000, pagamento: 'Entrada + Financiamento', obs: '', cartaCredito: false, status: 'Aprovada', contraproposta: 1420000, historico: [{ data: at(-12), texto: 'Contraproposta de R$ 1.420.000,00 enviada.' }, { data: at(-11), texto: 'Contraproposta aceita pelo cliente.' }], data: at(-13) },
    ];

    const pagamentos = [
      { id: 'pg_1', propostaId: 'p_3', forma: 'PIX', valor: 1850, status: 'Pago', transacaoId: 'GW-7F3A21', data: at(-14) },
      { id: 'pg_2', propostaId: 'p_4', forma: 'Cartão de Crédito', valor: 5000, status: 'Pago', transacaoId: 'GW-9B11C4', data: at(-10) },
    ];

    const contratos = [
      { id: 'c_1', numero: 'CT-2026-0001', propostaId: 'p_4', imovelId: 'i_4', tipo: 'Venda', inicio: at(-5), termino: null, valor: 1420000, vencimento: 10, indiceReajuste: 'IPCA', clausulas: 'Entrega das chaves em até 30 dias após a assinatura.', status: 'Aguardando Assinaturas',
        serasa: { score: 780, situacao: 'Regular', restricao: false, pendente: false }, envelopeId: 'ENV-55AC19',
        assinaturas: [
          { nome: 'Mariana Souza', email: 'mariana@habitahub.demo', papel: 'Comprador', status: 'Assinado', data: at(-4) },
          { nome: 'Paulo Lima', email: 'paulo@habitahub.demo', papel: 'Vendedor', status: 'Pendente', data: null },
          { nome: 'Carla Mendes', email: 'carla@habitahub.demo', papel: 'Imobiliária', status: 'Pendente', data: null },
        ],
        aditivos: [], versao: 1, pdfUrl: null, criadoEm: at(-5) },
    ];

    const avaliacoes = [
      { id: 'a_1', visitaId: 'v_4', clienteId: 'u_paulo', corretorId: 'u_corretor', imovelId: 'i_3', notaCorretor: 5, notaImovel: 4, comentario: 'Atendimento excelente e pontual.', anonimo: false, data: at(-19) },
    ];

    const notificacoes = [
      { id: 'n_1', usuarioId: 'u_joao', texto: 'Nova proposta de R$ 850.000,00 para "Apartamento 3 quartos no Batel".', href: '#/meus-imoveis', data: at(-2), lida: false },
      { id: 'n_2', usuarioId: 'u_joao', texto: 'Feedback da visita ao "Apartamento 3 quartos no Batel" disponível.', href: '#/meus-imoveis', data: at(-10), lida: true },
      { id: 'n_3', usuarioId: 'u_corretor', texto: 'Mariana Souza enviou uma proposta para HH-0001.', href: '#/propostas', data: at(-2), lida: false },
    ];

    return {
      usuarios, imoveis, visitas, propostas, pagamentos, contratos, avaliacoes, notificacoes,
      seq: { imovel: 6, contrato: 1 },
      // Comportamento das APIs simuladas (ver js/apis.js e o painel "Simulador de APIs").
      sim: { viacep: 'real', creci: 'ativo', gateway: 'aprovar', serasa: 'ok', assinatura: 'todas', oauth: 'ok' },
      sessao: null,
    };
  }

  // ---------- Banco (localStorage) ----------
  let db;
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || !db.usuarios) db = seed();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* modo privado: segue só em memória */ }
  }
  function reset() { db = seed(); save(); }
  load();

  const find = (coll, id) => db[coll].find((x) => x.id === id) || null;
  const where = (coll, pred) => db[coll].filter(pred);
  function insert(coll, obj) { db[coll].push(obj); save(); return obj; }
  function update(coll, id, patch) { const o = find(coll, id); if (o) { Object.assign(o, patch); save(); } return o; }
  function nextCodigo(kind) {
    db.seq[kind] = (db.seq[kind] || 0) + 1; save();
    const n = String(db.seq[kind]).padStart(4, '0');
    return kind === 'imovel' ? 'HH-' + n : 'CT-' + new Date().getFullYear() + '-' + n;
  }

  // ---------- Sessão ----------
  const me = () => (db.sessao ? find('usuarios', db.sessao) : null);
  const isStaff = (u = me()) => !!u && (u.perfil === 'corretor' || u.perfil === 'admin');
  function login(userId) { db.sessao = userId; save(); }
  function logout() { db.sessao = null; save(); go('#/login'); }

  // ---------- Notificações ----------
  function notify(usuarioId, texto, href = '') {
    insert('notificacoes', { id: uid('n'), usuarioId, texto, href, data: new Date().toISOString(), lida: false });
  }
  // Notifica todos os usuários da equipe (corretores e admins).
  function notifyStaff(texto, href = '') {
    db.usuarios.filter((u) => isStaff(u)).forEach((u) => notify(u.id, texto, href));
  }

  // ---------- Roteador ----------
  // HH.route('#/imoveis/:id', { title, uc, roles, render(ctx) -> html, mount(root, ctx) })
  //   roles: 'public' | array com 'cliente' | 'corretor' | 'admin'   (padrão: qualquer usuário logado)
  //   ctx: { params, query, user }
  const routes = [];
  function route(pattern, def) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ pattern, re, keys, ...def });
  }
  function match(hash) {
    const [path, qs] = hash.split('?');
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params, query: Object.fromEntries(new URLSearchParams(qs || '')) };
      }
    }
    return null;
  }
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  // Re-renderiza a rota atual (o shell em app.js fornece a implementação).
  let renderImpl = () => {};
  const render = () => renderImpl();
  const setRenderer = (fn) => { renderImpl = fn; };

  // ---------- Navegação lateral ----------
  // HH.nav({ label, href, roles, group, order })
  const navItems = [];
  const nav = (item) => navItems.push({ order: 50, group: 'Geral', ...item });

  // ---------- Regras de negócio compartilhadas ----------
  // Valor final de uma proposta aprovada (contraproposta aceita prevalece).
  const valorFinal = (p) => (p.contraproposta != null ? p.contraproposta : p.valor);
  // Taxa de reserva (UC08): 1º aluguel na locação; R$ 5.000,00 de sinal na venda.
  function taxaReserva(p) {
    const im = find('imoveis', p.imovelId);
    return im && im.modalidade === 'Aluguel' ? valorFinal(p) : 5000;
  }
  const pagamentoDe = (propostaId) => db.pagamentos.find((g) => g.propostaId === propostaId && g.status === 'Pago') || null;

  // ---------- Slots (pontos de extensão entre fatias) ----------
  // Uma fatia contribui com conteúdo na tela de outra sem editá-la:
  //   HH.slot('imovel.detalhe.acoes', { order, render(ctx) -> html, mount(root, ctx) })
  // A tela dona do slot chama HH.renderSlot(nome, ctx) no render e HH.mountSlot(nome, root, ctx) no mount.
  // Slots existentes estão documentados em prototipo/README.md.
  const slots = {};
  function slot(name, def) { (slots[name] = slots[name] || []).push({ order: 50, ...def }); slots[name].sort((a, b) => a.order - b.order); }
  const renderSlot = (name, ctx) => (slots[name] || []).map((d) => { try { return d.render(ctx) || ''; } catch (e) { console.error(e); return ''; } }).join('');
  const mountSlot = (name, root, ctx) => (slots[name] || []).forEach((d) => { if (d.mount) try { d.mount(root, ctx); } catch (e) { console.error(e); } });

  // ---------- UI helpers ----------
  const STATUS_CLASS = {
    'Disponível': 'ok', 'Reservado': 'warn', 'Indisponível': 'danger', 'Inativo': '',
    'Agendada': 'info', 'Confirmada': 'info', 'Realizada': 'ok', 'Cancelada': 'danger',
    'Em Análise': 'warn', 'Aprovada': 'ok', 'Recusada': 'danger', 'Contraproposta': 'info',
    'Pago': 'ok', 'Pendente': 'warn', 'Recusado': 'danger',
    'Rascunho': '', 'Aguardando Assinaturas': 'warn', 'Assinado': 'ok', 'Vigente': 'ok', 'Recusado pelo Assinante': 'danger',
  };
  const badge = (status) => `<span class="badge ${STATUS_CLASS[status] ?? ''}">${esc(status)}</span>`;
  const ucTag = (codes) => [].concat(codes || []).map((c) => `<span class="tag-uc">${esc(c)}</span>`).join('');
  const stars = (n, max = 5) => `<span class="stars" title="${Number(n).toFixed(1)} de ${max}">${Array.from({ length: max }, (_, i) => (i < Math.round(n) ? '★' : '<span class="off">★</span>')).join('')}</span>`;

  const PALETTE = [['#0f766e', '#14b8a6'], ['#9a3412', '#f97316'], ['#1e40af', '#60a5fa'], ['#6b21a8', '#c084fc'], ['#166534', '#4ade80'], ['#334155', '#94a3b8']];
  const HOUSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>';
  function thumb(imovel, size = '') {
    if (imovel.fotos && imovel.fotos[0]) return `<div class="thumb ${size}" style="background:#000"><img src="${esc(imovel.fotos[0])}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`;
    const [a, b] = PALETTE[(imovel.cor ?? 0) % PALETTE.length];
    return `<div class="thumb ${size}" style="background:linear-gradient(135deg,${a},${b})">${HOUSE_SVG}</div>`;
  }
  const initials = (nome) => String(nome || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const avatar = (u) => `<span class="avatar">${u && u.foto ? `<img src="${esc(u.foto)}" alt="">` : esc(initials(u && u.nome))}</span>`;

  function toast(msg, type = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  // HH.modal({ title, body (html), wide, actions: [{ label, class, onClick(close, root) -> false para manter aberto }], onMount(root, close), onClose() })
  // Retorna a função close().
  function modal({ title, body, wide = false, actions = [{ label: 'Fechar' }], onMount, onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">✕</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.class || ''}" data-action="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    let closed = false;
    const close = () => { if (closed) return; closed = true; wrap.remove(); if (onClose) onClose(); };
    wrap.addEventListener('click', async (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close();
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = actions[Number(btn.dataset.action)];
      if (!a.onClick) return close();
      const r = await a.onClick(close, wrap);
      if (r !== false) close();
    });
    document.body.appendChild(wrap);
    if (onMount) onMount(wrap, close);
    return close;
  }

  // Confirmação dentro da página (evita window.confirm). Retorna Promise<boolean>.
  function confirm(texto, { title = 'Confirmar', ok = 'Confirmar', danger = false } = {}) {
    return new Promise((resolve) => {
      let answer = false;
      modal({
        title, body: `<p>${esc(texto)}</p>`,
        actions: [
          { label: 'Cancelar' },
          { label: ok, class: danger ? 'btn-danger' : 'btn-primary', onClick: () => { answer = true; } },
        ],
        onClose: () => resolve(answer), // X, backdrop e "Cancelar" resolvem false
      });
    });
  }

  // Lê um <form> para objeto simples (checkbox -> boolean).
  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    }
    return out;
  }

  // Marca campos inválidos: HH.markInvalid(form, ['cep', 'valor'])
  function markInvalid(form, names) {
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    names.forEach((n) => { const el = form.elements[n]; if (el) el.classList.add('invalid'); });
  }

  // Estado de carregamento em um botão durante uma Promise.
  async function busy(btn, promise) {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Aguarde…';
    try { return await promise; } finally { btn.disabled = false; btn.innerHTML = html; }
  }

  return {
    DAY, uid, esc, money, date, dateTime, onlyDigits, hash, validaCPF, formatCPF, senhaForte,
    get db() { return db; }, save, reset, find, where, insert, update, nextCodigo,
    valorFinal, taxaReserva, pagamentoDe, slot, renderSlot, mountSlot,
    me, isStaff, login, logout, notify, notifyStaff,
    route, routes, match, go, render, setRenderer, nav, navItems,
    badge, ucTag, stars, thumb, avatar, initials, toast, modal, confirm, formData, markInvalid, busy,
  };
})();
