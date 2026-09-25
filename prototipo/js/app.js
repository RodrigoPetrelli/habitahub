/* HabitaHub – shell da aplicação: layout, menu, notificações, simulador de APIs,
 * painel inicial da equipe e o ciclo de renderização das rotas.
 * Carregado por último (depois dos módulos).
 */
(function () {
  'use strict';
  const { esc } = HH;
  const app = document.getElementById('app');
  const ui = { notifOpen: false, simOpen: false, navOpen: false };

  const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 14.5h5"/></svg>';

  const homeFor = (u) => (!u ? '#/login' : HH.isStaff(u) ? '#/painel' : '#/catalogo');
  const allowed = (r, u) => {
    if (r.roles === 'public') return true;
    if (!u) return false;
    return !r.roles || r.roles.includes(u.perfil);
  };

  // ---------- Painel inicial da equipe ----------
  HH.route('#/painel', {
    title: 'Painel', roles: ['corretor', 'admin'],
    render: ({ user }) => {
      const db = HH.db;
      const ativos = db.imoveis.filter((i) => i.status !== 'Inativo');
      const prox = db.visitas.filter((v) => v.status === 'Agendada' && new Date(v.dataHora) > new Date()).sort((a, b) => a.dataHora.localeCompare(b.dataHora));
      const emAnalise = db.propostas.filter((p) => p.status === 'Em Análise');
            const avs = db.avaliacoes.filter((a) => a.corretorId === user.id);
      const media = avs.length ? avs.reduce((s, a) => s + a.notaCorretor, 0) / avs.length : 0;
      const im = (id) => HH.find('imoveis', id) || {};
      const us = (id) => HH.find('usuarios', id) || {};
      return `
        <div class="page-head"><div><h1>Olá, ${esc(user.nome.split(' ')[0])}</h1><p class="sub">Resumo da operação da imobiliária.</p></div></div>
        <div class="grid grid-4">
          <div class="kpi"><div class="label">Imóveis ativos</div><div class="value">${ativos.length}</div></div>
          <div class="kpi"><div class="label">Visitas agendadas</div><div class="value">${prox.length}</div></div>
          <div class="kpi"><div class="label">Propostas em análise</div><div class="value">${emAnalise.length}</div></div>
          <div class="kpi"><div class="label">Sua avaliação média</div><div class="value">${avs.length ? media.toFixed(1) : '—'}</div>${avs.length ? HH.stars(media) : ''}</div>
        </div>
        <div class="grid grid-2" style="margin-top:16px">
          <div class="card"><div class="card-title"><h3>Próximas visitas</h3><a href="#/agenda">Ver agenda</a></div>
            ${prox.length ? `<table class="table"><tbody>${prox.slice(0, 5).map((v) => `<tr><td>${HH.dateTime(v.dataHora)}</td><td>${esc(im(v.imovelId).codigo)} · ${esc(im(v.imovelId).titulo)}</td><td class="muted">${esc(us(v.clienteId).nome)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma visita agendada.</div>'}
          </div>
          <div class="card"><div class="card-title"><h3>Pendências</h3></div>
            ${(() => { const h = HH.renderSlot('painel.pendencias', { user }); return h ? `<ul class="timeline">${h}</ul>` : '<div class="empty">Nada pendente por aqui.</div>'; })()}
          </div>
        </div>`;
    },
  });
  HH.nav({ label: 'Painel', href: '#/painel', roles: ['corretor', 'admin'], group: 'Imobiliária', order: 0 });

  // ---------- Layout ----------
  function navHtml(user, current) {
    const items = HH.navItems.filter((n) => !n.roles || n.roles.includes(user.perfil)).sort((a, b) => a.order - b.order);
    const groups = [];
    items.forEach((n) => { let g = groups.find((x) => x.name === n.group); if (!g) groups.push((g = { name: n.group, items: [] })); g.items.push(n); });
    return groups.map((g) => `<div class="nav-group">${esc(g.name)}</div>` + g.items.map((n) => `<a href="${esc(n.href)}" class="${current.startsWith(n.href) ? 'active' : ''}">${esc(n.label)}</a>`).join('')).join('');
  }

  function notifHtml(user) {
    const list = HH.db.notificacoes.filter((n) => n.usuarioId === user.id).sort((a, b) => b.data.localeCompare(a.data));
    return `<div class="dropdown">
      <div class="row between" style="padding:10px 14px;border-bottom:1px solid var(--border)"><strong>Notificações</strong>${list.some((n) => !n.lida) ? '<button class="btn btn-sm btn-ghost" data-ui="read-all">Marcar como lidas</button>' : ''}</div>
      ${list.length ? list.map((n) => `<div class="item ${n.lida ? '' : 'unread'}">${n.href ? `<a href="${esc(n.href)}" data-notif="${esc(n.id)}">${esc(n.texto)}</a>` : esc(n.texto)}<div class="small muted">${HH.dateTime(n.data)}</div></div>`).join('') : '<div class="item muted">Sem notificações.</div>'}
    </div>`;
  }

  function simHtml() {
    const s = HH.db.sim;
    return `<aside class="sim-panel">
      <div class="row between"><h3 style="margin:0">Simulador de APIs</h3><button class="icon-btn" data-ui="sim" aria-label="Fechar">✕</button></div>
      <p class="small muted">Force respostas das integrações externas para demonstrar os fluxos alternativos e de exceção.</p>
      <form class="form" id="sim-form">
        ${Object.entries(HH.api.OPTIONS).map(([k, o]) => `<div class="field"><label>${esc(o.label)}</label><select class="input" name="${k}">${Object.entries(o.values).map(([v, l]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}
      </form>
      <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
      <button class="btn btn-danger btn-sm" data-ui="reset">Restaurar dados de demonstração</button>
    </aside>`;
  }

  function shell(user, current, inner) {
    const unread = HH.db.notificacoes.filter((n) => n.usuarioId === user.id && !n.lida).length;
    const perfilLabel = { corretor: 'Corretor', admin: 'Administrador', cliente: 'Cliente' }[user.perfil];
    return `<div class="shell ${ui.navOpen ? 'nav-open' : ''}">
      <header class="topbar">
        <button class="icon-btn menu-toggle" data-ui="nav" aria-label="Menu">☰</button>
        <a class="logo" href="${homeFor(user)}">${LOGO} HabitaHub</a>
        <div class="spacer"></div>
        <button class="btn btn-sm btn-ghost" data-ui="sim" title="Simulador de APIs">⚙ Simulador</button>
        <div class="bell" style="position:relative">
          <button class="icon-btn" data-ui="notif" aria-label="Notificações">🔔${unread ? `<span class="dot">${unread}</span>` : ''}</button>
          ${ui.notifOpen ? notifHtml(user) : ''}
        </div>
        <a class="user-chip" href="#/perfil" title="Meu perfil">${HH.avatar(user)}<span><strong>${esc(user.nome)}</strong><br><span class="small muted">${perfilLabel}</span></span></a>
        <button class="btn btn-sm" data-ui="logout">Sair</button>
      </header>
      <nav class="sidebar">${navHtml(user, current)}</nav>
      <main class="main" id="view">${inner}</main>
    </div>${ui.simOpen ? simHtml() : ''}`;
  }

  // ---------- Ciclo de renderização ----------
  function renderRoute() {
    const hash = location.hash || '';
    const user = HH.me();
    const m = HH.match(hash.split('?')[0] ? hash : '#/');
    if (!m || hash === '' || hash === '#/') { location.replace(homeFor(user)); return; }
    if (!allowed(m.route, user)) { location.replace(homeFor(user)); return; }

    const ctx = { params: m.params, query: m.query, user };
    let inner;
    try { inner = m.route.render(ctx); } catch (e) { console.error(e); inner = `<div class="alert danger">Erro ao renderizar a tela: ${esc(e.message)}</div>`; }
    document.title = (m.route.title ? m.route.title + ' · ' : '') + 'HabitaHub';

    // Telas públicas (login/cadastro) ou usuário deslogado: sem shell.
    if (!user || m.route.bare) app.innerHTML = `<div class="auth-wrap">${inner}</div>`;
    else app.innerHTML = shell(user, hash, inner);

    const root = document.getElementById('view') || app;
    if (m.route.mount) {
      try { m.route.mount(root, ctx); } catch (e) { console.error(e); HH.toast('Erro: ' + e.message, 'danger'); }
    }
  }
  HH.setRenderer(renderRoute);

  // Ações globais do shell
  app.addEventListener('click', (e) => {
    const n = e.target.closest('[data-notif]');
    if (n) { HH.update('notificacoes', n.dataset.notif, { lida: true }); ui.notifOpen = false; return; }
    const b = e.target.closest('[data-ui]');
    if (!b) { if (ui.notifOpen && !e.target.closest('.bell')) { ui.notifOpen = false; renderRoute(); } return; }
    const act = b.dataset.ui;
    if (act === 'notif') ui.notifOpen = !ui.notifOpen;
    if (act === 'read-all') { HH.db.notificacoes.forEach((x) => { if (x.usuarioId === HH.db.sessao) x.lida = true; }); HH.save(); }
    if (act === 'sim') ui.simOpen = !ui.simOpen;
    if (act === 'nav') ui.navOpen = !ui.navOpen;
    if (act === 'logout') { ui.notifOpen = ui.simOpen = false; HH.logout(); return; }
    if (act === 'reset') {
      HH.confirm('Todos os dados criados no protótipo serão apagados.', { title: 'Restaurar demonstração', ok: 'Restaurar', danger: true })
        .then((ok) => { if (ok) { HH.reset(); ui.simOpen = false; HH.toast('Dados de demonstração restaurados.', 'ok'); location.hash = '#/login'; renderRoute(); } });
      return;
    }
    renderRoute();
  });
  document.addEventListener('change', (e) => {
    if (e.target.closest('#sim-form')) {
      HH.db.sim[e.target.name] = e.target.value; HH.save();
      HH.toast(`${HH.api.OPTIONS[e.target.name].label}: ${HH.api.OPTIONS[e.target.name].values[e.target.value]}`);
    }
  });
  window.addEventListener('hashchange', () => { ui.navOpen = false; renderRoute(); });

  renderRoute();
})();
