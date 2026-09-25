/* HabitaHub – fatia vertical 3: Visita (UC04 Agendar Visita + UC11 Registrar Avaliação).
 * Fluxo: cliente agenda/reagenda → corretor realiza e registra o feedback → proprietário
 * recebe o feedback → cliente avalia o atendimento → média do corretor é atualizada.
 * Rotas: #/minhas-visitas (cliente), #/agenda e #/avaliacoes (equipe).
 * Slots: imovel.detalhe.acoes, proprietario.imovel, painel.pendencias. Ver prototipo/README.md.
 */
(function () {
  'use strict';
  const { esc } = HH;

  const HORA = 3600000;
  const DIAS = 14;                                  // agenda: próximos 14 dias
  const HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17]; // início dos horários (visitas de 1h, das 9h às 18h)
  const ANTECEDENCIA = 24 * HORA;                   // UC04 RN1
  const MSG_E1 = 'Horário não mais disponível. Por favor, escolha outro horário.';
  const MSG_RN1 = 'Agendamentos devem ser feitos com antecedência mínima de 24 horas em relação ao horário atual.';
  const MSG_INDISP = 'Imóvel indisponível: somente imóveis com status "Disponível" aceitam novas visitas.';
  const MSG_AV_E1 = 'Por favor, selecione uma nota de 1 a 5 estrelas para o corretor e para o imóvel.';
  const MSG_AV_NAO_REALIZADA = 'Visita não realizada: apenas clientes que efetivamente realizaram a visita podem avaliar.';
  const MSG_AV_EXISTENTE = 'Avaliação já existente: esta visita já foi avaliada.';
  const ROTULO_NOTA = ['Sem nota', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'];

  // Horários "tomados por outro usuário" para demonstrar o E1 (somente em memória).
  const simTomados = new Set();
  let filtroAgenda = 'Todas';

  // ---------- Utilitários locais ----------
  const imv = (id) => HH.find('imoveis', id) || { id, titulo: 'Imóvel removido', codigo: '—', fotos: [] };
  const usr = (id) => HH.find('usuarios', id) || { id, nome: '—' };
  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '—';
  const ts = (iso) => new Date(iso).getTime();
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtMedia = (n) => n.toFixed(1).replace('.', ',');
  const media = (arr, k) => (arr.length ? arr.reduce((s, a) => s + Number(a[k] || 0), 0) / arr.length : 0);
  const avaliacaoDe = (visitaId) => HH.db.avaliacoes.find((a) => a.visitaId === visitaId) || null;
  const corretorDe = (imovel) => imovel.corretorId || (HH.db.usuarios.find((u) => u.perfil === 'corretor') || {}).id || null;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  function diaLabel(d) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const diff = Math.round((x - hoje) / HH.DAY);
    const base = cap(x.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
    return diff === 0 ? 'Hoje · ' + base : diff === 1 ? 'Amanhã · ' + base : diff === -1 ? 'Ontem · ' + base : base;
  }
  const chaveDia = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  // Visitas gravadas por outra aba/usuário (o localStorage é o "servidor" do protótipo).
  function visitasPersistidas() {
    try { const d = JSON.parse(localStorage.getItem('habitahub.proto.v1')); return d && Array.isArray(d.visitas) ? d.visitas : []; } catch (e) { return []; }
  }

  // Slot ocupado: visita "Agendada" do mesmo imóvel OU do mesmo corretor sobrepondo o horário.
  function ocupado(t, imovel, ignorarId, lista) {
    const corretorId = corretorDe(imovel);
    return lista.some((v) => v.id !== ignorarId && v.status === 'Agendada'
      && (v.imovelId === imovel.id || (corretorId && v.corretorId === corretorId))
      && Math.abs(ts(v.dataHora) - t) < HORA);
  }
  const antecedenciaOk = (t) => t - Date.now() >= ANTECEDENCIA; // RN1

  function gerarAgenda(imovel, ignorarId) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = [];
    for (let d = 0; d < DIAS; d++) {
      const dia = new Date(hoje); dia.setDate(hoje.getDate() + d);
      const slots = [];
      HORAS.forEach((h) => {
        const s = new Date(dia); s.setHours(h, 0, 0, 0);
        const t = s.getTime();
        if (antecedenciaOk(t) && !simTomados.has(t) && !ocupado(t, imovel, ignorarId, HH.db.visitas)) slots.push(t);
      });
      dias.push({ dia, slots });
    }
    return { dias };
  }

  // Revalidação no momento da confirmação (UC04 passo 4: E1 e RN1).
  function validarSlot(t, imovel, ignorarId) {
    const atual = HH.find('imoveis', imovel.id);
    if (!atual || atual.status !== 'Disponível') return MSG_INDISP;
    if (!antecedenciaOk(t)) return MSG_RN1;
    if (simTomados.has(t) || ocupado(t, atual, ignorarId, HH.db.visitas) || ocupado(t, atual, ignorarId, visitasPersistidas())) return MSG_E1;
    return null;
  }

  function visitasEquipe(user) {
    return HH.db.visitas.filter((v) => user.perfil === 'admin' || v.corretorId === user.id);
  }

  // ---------- UC04: seletor de horários (agendar e reagendar) ----------
  function abrirAgenda({ imovel, user, visita }) {
    const reag = !!visita;
    let sel = null;
    let diaIdx = -1;

    const body = `<div class="vis-agenda">
      <div class="row vis-imovel">${HH.thumb(imovel, 'sm')}<div><strong>${esc(imovel.titulo)}</strong>
        <div class="small muted">${esc(imovel.codigo)} · ${esc(imovel.bairro || '')}${imovel.cidade ? ', ' + esc(imovel.cidade) : ''} · Corretor: ${esc(usr(corretorDe(imovel)).nome)}</div></div></div>
      ${reag ? `<div class="alert info">Horário atual: <strong>${esc(HH.dateTime(visita.dataHora))}</strong>. Escolha um novo horário disponível.</div>` : ''}
      <div data-vis-erro></div>
      <div data-vis-grade></div>
      <div class="field"><label for="vis-obs">Observação (opcional)</label>
        <textarea class="input" id="vis-obs" name="obs" maxlength="500" placeholder="Ex.: gostaria de ver a vaga de garagem.">${reag ? esc(visita.obs) : ''}</textarea></div>
      <label class="check small muted vis-sim"><input type="checkbox" data-vis-sim> Simular: outro usuário reserva o horário selecionado antes da confirmação (demonstra o E1)</label>
    </div>`;

    function erro(root, msg) {
      root.querySelector('[data-vis-erro]').innerHTML = msg ? `<div class="alert danger">${esc(msg)}</div>` : '';
    }

    function renderGrade(root) {
      const { dias } = gerarAgenda(imovel, reag ? visita.id : null);
      if (sel != null && !dias.some((d) => d.slots.includes(sel))) sel = null;
      if (diaIdx < 0 || !dias[diaIdx] || !dias[diaIdx].slots.length) diaIdx = dias.findIndex((d) => d.slots.length);
      const dia = dias[diaIdx];
      root.querySelector('[data-vis-grade]').innerHTML = `
        <div class="field"><label>Data</label>
          <div class="vis-dias">${dias.map((d, i) => `<button type="button" class="vis-dia-chip ${i === diaIdx ? 'active' : ''}" data-vis-dia="${i}" ${d.slots.length ? '' : 'disabled'}>
            <span>${esc(d.dia.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''))}</span>
            <strong>${esc(d.dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))}</strong>
            <small>${d.slots.length ? plural(d.slots.length, 'horário', 'horários') : 'sem vagas'}</small></button>`).join('')}</div></div>
        <div class="field"><label>Horário</label>
          ${dia ? `<div class="vis-slots">${dia.slots.map((t) => `<button type="button" class="vis-slot ${t === sel ? 'active' : ''}" data-vis-slot="${t}" aria-pressed="${t === sel}">${esc(hora(t))}</button>`).join('')}</div>`
            : '<div class="empty">Nenhum horário disponível nos próximos 14 dias.</div>'}
          <span class="hint">Horários das 9h às 18h. Horários já ocupados (imóvel ou corretor) ou com menos de 24h de antecedência não são exibidos.</span>
        </div>
        <div class="vis-resumo ${sel != null ? '' : 'muted'}">${sel != null ? `Selecionado: <strong>${esc(diaLabel(sel))} às ${esc(hora(sel))}</strong>` : 'Selecione um dia e um horário.'}</div>`;
    }

    HH.modal({
      title: reag ? 'Reagendar visita' : 'Agendar visita',
      wide: true,
      body,
      onMount: (root) => {
        renderGrade(root);
        root.querySelector('[data-vis-grade]').addEventListener('click', (e) => {
          const d = e.target.closest('[data-vis-dia]');
          if (d && !d.disabled) { diaIdx = Number(d.dataset.visDia); renderGrade(root); return; }
          const s = e.target.closest('[data-vis-slot]');
          if (s) { sel = Number(s.dataset.visSlot); erro(root, ''); renderGrade(root); }
        });
      },
      actions: [
        { label: 'Cancelar' },
        {
          label: reag ? 'Confirmar novo horário' : 'Confirmar agendamento', class: 'btn-primary',
          onClick: (close, root) => {
            if (sel == null) { erro(root, 'Selecione um dia e um horário disponíveis.'); return false; }
            const sim = root.querySelector('[data-vis-sim]');
            if (sim.checked) { simTomados.add(sel); sim.checked = false; }
            const msg = validarSlot(sel, imovel, reag ? visita.id : null);
            if (msg) {
              erro(root, msg); HH.toast(msg, 'danger');
              sel = null; renderGrade(root);
              return false;
            }
            const obs = root.querySelector('[name="obs"]').value.trim();
            const dataHora = new Date(sel).toISOString();
            const quando = HH.dateTime(dataHora);
            let v;
            if (reag) {
              const anterior = HH.dateTime(visita.dataHora);
              v = HH.update('visitas', visita.id, { dataHora, obs, reagendadaEm: new Date().toISOString() });
              HH.notify(v.corretorId, `${user.nome} reagendou a visita ao ${imovel.codigo} de ${anterior} para ${quando}.`, '#/agenda');
              if (imovel.proprietarioId && imovel.proprietarioId !== user.id) HH.notify(imovel.proprietarioId, `A visita ao "${imovel.titulo}" foi reagendada para ${quando}.`, '#/meus-imoveis/' + imovel.id);
              HH.toast('Visita reagendada com sucesso.', 'ok');
            } else {
              v = HH.insert('visitas', {
                id: HH.uid('v'), imovelId: imovel.id, clienteId: user.id, corretorId: corretorDe(imovel),
                dataHora, status: 'Agendada', obs, feedback: '', criadoEm: new Date().toISOString(),
              });
              if (v.corretorId) HH.notify(v.corretorId, `${user.nome} agendou uma visita ao ${imovel.codigo} para ${quando}.`, '#/agenda');
              if (imovel.proprietarioId && imovel.proprietarioId !== user.id) HH.notify(imovel.proprietarioId, `Nova visita agendada ao "${imovel.titulo}" para ${quando}.`, '#/meus-imoveis/' + imovel.id);
              HH.toast('Visita agendada com sucesso.', 'ok');
            }
            close();
            HH.render();
            mostrarConfirmacao(v, reag);
            return true;
          },
        },
      ],
    });
  }

  // UC04 passo 6: exibe os detalhes da confirmação.
  function mostrarConfirmacao(v, reag) {
    const im = imv(v.imovelId);
    HH.modal({
      title: reag ? 'Visita reagendada' : 'Visita agendada',
      body: `<div class="alert ok">${reag ? 'Novo horário confirmado.' : 'Agendamento confirmado.'} O corretor e o proprietário foram notificados.</div>
        <table class="table vis-detalhes"><tbody>
          <tr><th>Imóvel</th><td>${esc(im.codigo)} · ${esc(im.titulo)}</td></tr>
          <tr><th>Endereço</th><td>${esc([im.logradouro, im.numero].filter(Boolean).join(', '))}${im.bairro ? ' – ' + esc(im.bairro) : ''}</td></tr>
          <tr><th>Data e hora</th><td><strong>${esc(diaLabel(v.dataHora))} às ${esc(hora(ts(v.dataHora)))}</strong></td></tr>
          <tr><th>Corretor</th><td>${esc(usr(v.corretorId).nome)}</td></tr>
          <tr><th>Status</th><td>${HH.badge(v.status)}</td></tr>
          ${v.obs ? `<tr><th>Observação</th><td>${esc(v.obs)}</td></tr>` : ''}
        </tbody></table>`,
      actions: [{ label: 'Fechar' }, { label: 'Ver minhas visitas', class: 'btn-primary', onClick: () => { HH.go('#/minhas-visitas'); } }],
    });
  }

  // ---------- UC11: Registrar Avaliação ----------
  function motivoNaoAvaliavel(v, user) {
    if (!v || v.clienteId !== user.id || v.status !== 'Realizada') return MSG_AV_NAO_REALIZADA; // RN1
    if (avaliacaoDe(v.id)) return MSG_AV_EXISTENTE; // uma avaliação por visita
    return null;
  }

  const estrelas = (k) => `<div class="vis-stars" role="radiogroup" data-vis-stars="${k}">
    ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="vis-star" role="radio" aria-checked="false" aria-label="${plural(n, 'estrela', 'estrelas')}" data-n="${n}">★</button>`).join('')}
    <span class="small muted" data-vis-stars-label>${ROTULO_NOTA[0]}</span></div>`;

  function abrirAvaliacao(v, user, depois) {
    const motivo = motivoNaoAvaliavel(v, user);
    if (motivo) { HH.toast(motivo, 'danger'); return; }
    const im = imv(v.imovelId);
    const corretor = usr(v.corretorId);
    const notas = { corretor: 0, imovel: 0 };

    const pintar = (root) => Object.keys(notas).forEach((k) => {
      const g = root.querySelector(`[data-vis-stars="${k}"]`);
      g.querySelectorAll('.vis-star').forEach((b) => {
        const on = Number(b.dataset.n) <= notas[k];
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(Number(b.dataset.n) === notas[k]));
      });
      g.querySelector('[data-vis-stars-label]').textContent = ROTULO_NOTA[notas[k]];
      if (notas[k]) g.classList.remove('invalid');
    });

    HH.modal({
      title: 'Avaliar atendimento',
      body: `<form class="form" data-vis-av-form onsubmit="return false">
        <div class="row vis-imovel">${HH.thumb(im, 'sm')}<div><strong>${esc(im.titulo)}</strong>
          <div class="small muted">${esc(im.codigo)} · visita em ${esc(HH.dateTime(v.dataHora))} · Corretor: ${esc(corretor.nome)}</div></div></div>
        <div data-vis-erro></div>
        <div class="field"><label>Atendimento do corretor (${esc(corretor.nome)})</label>${estrelas('corretor')}</div>
        <div class="field"><label>Imóvel visitado</label>${estrelas('imovel')}</div>
        <div class="field"><label for="vis-coment">Comentário</label>
          <textarea class="input" id="vis-coment" name="comentario" maxlength="1000" placeholder="Conte como foi o atendimento e a visita ao imóvel."></textarea></div>
        <label class="check"><input type="checkbox" name="anonimo"> Manter avaliação anônima para o público</label>
      </form>`,
      onMount: (root) => {
        root.querySelectorAll('[data-vis-stars]').forEach((g) => g.addEventListener('click', (e) => {
          const b = e.target.closest('.vis-star');
          if (!b) return;
          notas[g.dataset.visStars] = Number(b.dataset.n);
          pintar(root);
          if (notas.corretor && notas.imovel) root.querySelector('[data-vis-erro]').innerHTML = '';
        }));
      },
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Limpar',
          onClick: (close, root) => {
            notas.corretor = notas.imovel = 0;
            root.querySelector('[data-vis-av-form]').reset();
            root.querySelector('[data-vis-erro]').innerHTML = '';
            root.querySelectorAll('.vis-stars.invalid').forEach((g) => g.classList.remove('invalid'));
            pintar(root);
            return false;
          },
        },
        {
          label: 'Enviar avaliação', class: 'btn-primary',
          onClick: (close, root) => {
            if (!notas.corretor || !notas.imovel) { // E1
              root.querySelector('[data-vis-erro]').innerHTML = `<div class="alert danger">${esc(MSG_AV_E1)}</div>`;
              Object.keys(notas).forEach((k) => { if (!notas[k]) root.querySelector(`[data-vis-stars="${k}"]`).classList.add('invalid'); });
              return false;
            }
            const m2 = motivoNaoAvaliavel(HH.find('visitas', v.id), user);
            if (m2) { root.querySelector('[data-vis-erro]').innerHTML = `<div class="alert danger">${esc(m2)}</div>`; return false; }
            const f = HH.formData(root.querySelector('[data-vis-av-form]'));
            HH.insert('avaliacoes', {
              id: HH.uid('a'), visitaId: v.id, clienteId: user.id, corretorId: v.corretorId, imovelId: v.imovelId,
              notaCorretor: notas.corretor, notaImovel: notas.imovel, comentario: f.comentario, anonimo: !!f.anonimo,
              data: new Date().toISOString(),
            });
            // Recalcula a média do corretor (pós-condição do UC11).
            const avs = HH.where('avaliacoes', (a) => a.corretorId === v.corretorId);
            const m = media(avs, 'notaCorretor');
            HH.notify(v.corretorId, `Nova avaliação recebida: ${notas.corretor}★ pelo atendimento no ${im.codigo}. Sua média agora é ${fmtMedia(m)} (${plural(avs.length, 'avaliação', 'avaliações')}).`, '#/avaliacoes');
            HH.toast(`Avaliação enviada. Obrigado! Média do corretor atualizada para ${fmtMedia(m)}.`, 'ok');
            close();
            if (depois) depois(); else HH.render();
            return true;
          },
        },
      ],
    });
  }

  // ---------- Registro de feedback pelo corretor ----------
  function abrirFeedback(v) {
    const im = imv(v.imovelId);
    const primeira = !v.feedback;
    HH.modal({
      title: primeira ? 'Registrar feedback da visita' : 'Editar feedback da visita',
      body: `<form class="form" data-vis-fb-form onsubmit="return false">
        <p><strong>${esc(im.codigo)} · ${esc(im.titulo)}</strong><br><span class="small muted">Visita em ${esc(HH.dateTime(v.dataHora))} · Interessado: ${esc(usr(v.clienteId).nome)}</span></p>
        <div data-vis-erro></div>
        <div class="field"><label for="vis-fb">Feedback para o proprietário</label>
          <textarea class="input" id="vis-fb" name="feedback" maxlength="1500" rows="5" placeholder="Impressões do interessado, pontos positivos, objeções e próximos passos.">${esc(v.feedback)}</textarea>
          <span class="hint">O proprietário é notificado assim que você salvar. Não inclua dados pessoais do interessado.</span></div>
      </form>`,
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Salvar e enviar ao proprietário', class: 'btn-primary',
          onClick: (close, root) => {
            const form = root.querySelector('[data-vis-fb-form]');
            const texto = form.elements.feedback.value.trim();
            if (!texto) {
              HH.markInvalid(form, ['feedback']);
              root.querySelector('[data-vis-erro]').innerHTML = '<div class="alert danger">Descreva o feedback da visita para o proprietário.</div>';
              return false;
            }
            HH.update('visitas', v.id, { feedback: texto, feedbackEm: new Date().toISOString() });
            if (im.proprietarioId) HH.notify(im.proprietarioId, primeira ? `Feedback da visita ao "${im.titulo}" disponível.` : `Feedback da visita ao "${im.titulo}" atualizado.`, '#/meus-imoveis/' + im.id);
            if (primeira && !avaliacaoDe(v.id)) HH.notify(v.clienteId, `Como foi sua visita ao "${im.titulo}"? Avalie o atendimento.`, '#/minhas-visitas?avaliar=' + v.id);
            HH.toast(primeira ? 'Feedback enviado ao proprietário.' : 'Feedback atualizado.', 'ok');
            close();
            HH.render();
            return true;
          },
        },
      ],
    });
  }

  // ---------- Menu ----------
  HH.nav({ label: 'Minhas visitas', href: '#/minhas-visitas', roles: ['cliente'], group: 'Cliente', order: 20 });
  HH.nav({ label: 'Agenda', href: '#/agenda', roles: ['corretor', 'admin'], group: 'Imobiliária', order: 20 });
  HH.nav({ label: 'Avaliações', href: '#/avaliacoes', roles: ['corretor', 'admin'], group: 'Imobiliária', order: 50 });

  // ---------- #/minhas-visitas (cliente) ----------
  HH.route('#/minhas-visitas', {
    title: 'Minhas visitas', roles: ['cliente'],
    render: ({ user }) => {
      const agora = Date.now();
      const lista = HH.db.visitas.filter((v) => v.clienteId === user.id).sort((a, b) => {
        const pa = a.status === 'Agendada' ? 0 : 1, pb = b.status === 'Agendada' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return pa === 0 ? ts(a.dataHora) - ts(b.dataHora) : ts(b.dataHora) - ts(a.dataHora);
      });
      const pendentes = lista.filter((v) => v.status === 'Realizada' && !avaliacaoDe(v.id)).length;
      const linha = (v) => {
        const im = imv(v.imovelId);
        const av = avaliacaoDe(v.id);
        const acoes = [];
        if (v.status === 'Agendada') {
          acoes.push(`<button class="btn btn-sm" data-vis-reagendar="${esc(v.id)}">Reagendar</button>`);
          acoes.push(`<button class="btn btn-sm btn-ghost" data-vis-cancelar="${esc(v.id)}">Cancelar</button>`);
        }
        if (v.status === 'Realizada' && !av) acoes.push(`<button class="btn btn-sm btn-primary" data-vis-avaliar="${esc(v.id)}">Avaliar atendimento</button>`);
        const avHtml = av
          ? `<div class="small">Corretor ${HH.stars(av.notaCorretor)}</div><div class="small">Imóvel ${HH.stars(av.notaImovel)}</div>${av.comentario ? `<div class="small muted vis-coment">“${esc(av.comentario)}”</div>` : ''}${av.anonimo ? '<span class="badge">Anônima</span>' : ''}`
          : v.status === 'Realizada' ? '<span class="badge warn">Pendente</span>' : '<span class="muted">—</span>';
        return `<tr>
          <td><div class="row vis-cell-imovel">${HH.thumb(im, 'sm')}<div><a href="#/imovel/${esc(im.id)}"><strong>${esc(im.titulo)}</strong></a><div class="small muted">${esc(im.codigo)}${im.bairro ? ' · ' + esc(im.bairro) : ''}</div>${v.obs ? `<div class="small muted">Obs.: ${esc(v.obs)}</div>` : ''}</div></div></td>
          <td>${esc(HH.dateTime(v.dataHora))}${v.status === 'Agendada' && ts(v.dataHora) > agora ? `<div class="small muted">${esc(diaLabel(v.dataHora).split(' · ')[0])}</div>` : ''}</td>
          <td>${esc(usr(v.corretorId).nome)}</td>
          <td>${HH.badge(v.status)}</td>
          <td>${avHtml}</td>
          <td><div class="row end">${acoes.join('') || '<span class="muted small">—</span>'}</div></td>
        </tr>`;
      };
      return `
        <div class="page-head"><div><h1>Minhas visitas ${HH.ucTag(['UC04', 'UC11'])}</h1><p class="sub">Acompanhe, reagende ou cancele suas visitas e avalie o atendimento após a visita.</p></div>
          <a class="btn btn-primary" href="#/catalogo">Agendar nova visita</a></div>
        ${pendentes ? `<div class="alert info">Você tem ${plural(pendentes, 'visita realizada aguardando', 'visitas realizadas aguardando')} sua avaliação.</div>` : ''}
        <div class="card">${lista.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Imóvel</th><th>Data e hora</th><th>Corretor</th><th>Status</th><th>Sua avaliação</th><th style="text-align:right">Ações</th></tr></thead>
          <tbody>${lista.map(linha).join('')}</tbody></table></div>`
          : '<div class="empty">Você ainda não agendou visitas. Encontre um imóvel no <a href="#/catalogo">catálogo</a> e clique em "Agendar visita".</div>'}</div>`;
    },
    mount: (root, { user, query }) => {
      root.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-vis-reagendar]');
        if (r) {
          const v = HH.find('visitas', r.dataset.visReagendar);
          if (!v || v.status !== 'Agendada') return;
          const im = HH.find('imoveis', v.imovelId);
          if (!im || im.status !== 'Disponível') { HH.toast(MSG_INDISP, 'danger'); return; }
          abrirAgenda({ imovel: im, user, visita: v });
          return;
        }
        const c = e.target.closest('[data-vis-cancelar]');
        if (c) {
          const v = HH.find('visitas', c.dataset.visCancelar);
          if (!v || v.status !== 'Agendada') return;
          const im = imv(v.imovelId);
          const ok = await HH.confirm(`Cancelar a visita ao "${im.titulo}" em ${HH.dateTime(v.dataHora)}? O horário será liberado na agenda.`, { title: 'Cancelar visita', ok: 'Cancelar visita', danger: true });
          if (!ok) return;
          HH.update('visitas', v.id, { status: 'Cancelada', canceladaEm: new Date().toISOString() });
          if (v.corretorId) HH.notify(v.corretorId, `${user.nome} cancelou a visita ao ${im.codigo} de ${HH.dateTime(v.dataHora)}.`, '#/agenda');
          if (im.proprietarioId && im.proprietarioId !== user.id) HH.notify(im.proprietarioId, `A visita ao "${im.titulo}" de ${HH.dateTime(v.dataHora)} foi cancelada.`, '#/meus-imoveis/' + im.id);
          HH.toast('Visita cancelada.', 'ok');
          HH.render();
          return;
        }
        const a = e.target.closest('[data-vis-avaliar]');
        if (a) abrirAvaliacao(HH.find('visitas', a.dataset.visAvaliar), user);
      });
      // Convite recebido por notificação: #/minhas-visitas?avaliar=<visitaId>
      if (query && query.avaliar) {
        try { history.replaceState(null, '', '#/minhas-visitas'); } catch (e) { /* ignora */ }
        const v = HH.find('visitas', query.avaliar);
        if (v && v.clienteId === user.id) abrirAvaliacao(v, user);
      }
    },
  });

  // ---------- #/agenda (equipe) ----------
  HH.route('#/agenda', {
    title: 'Agenda de visitas', roles: ['corretor', 'admin'],
    render: ({ user }) => {
      const agora = Date.now();
      const hojeKey = chaveDia(new Date().toISOString());
      const todas = visitasEquipe(user);
      const lista = todas.filter((v) => filtroAgenda === 'Todas' || v.status === filtroAgenda);
      const prox = lista.filter((v) => ts(v.dataHora) >= agora).sort((a, b) => ts(a.dataHora) - ts(b.dataHora));
      const pass = lista.filter((v) => ts(v.dataHora) < agora).sort((a, b) => ts(b.dataHora) - ts(a.dataHora));
      const semFeedback = todas.filter((v) => v.status === 'Realizada' && !v.feedback).length;

      const item = (v) => {
        const im = imv(v.imovelId);
        const cli = usr(v.clienteId);
        const av = avaliacaoDe(v.id);
        const acoes = [];
        if (v.status === 'Agendada') {
          acoes.push(`<button class="btn btn-sm btn-primary" data-vis-realizar="${esc(v.id)}">Marcar como realizada</button>`);
          acoes.push(`<button class="btn btn-sm btn-ghost" data-vis-cancelar-eq="${esc(v.id)}">Cancelar</button>`);
        }
        if (v.status === 'Realizada') acoes.push(`<button class="btn btn-sm ${v.feedback ? '' : 'btn-primary'}" data-vis-feedback="${esc(v.id)}">${v.feedback ? 'Editar feedback' : 'Registrar feedback'}</button>`);
        return `<div class="vis-item ${v.status === 'Cancelada' ? 'vis-cancelada' : ''}">
          <div class="vis-hora">${esc(hora(ts(v.dataHora)))}</div>
          <div class="vis-info">
            <div class="row"><a href="#/imovel/${esc(im.id)}"><strong>${esc(im.codigo)} · ${esc(im.titulo)}</strong></a>${HH.badge(v.status)}</div>
            <div class="small muted">Cliente: ${esc(cli.nome)}${cli.telefone ? ' · ' + esc(cli.telefone) : ''}${cli.email ? ' · ' + esc(cli.email) : ''}${user.perfil === 'admin' ? ' · Corretor: ' + esc(usr(v.corretorId).nome) : ''}</div>
            ${v.obs ? `<div class="small">Observação do cliente: “${esc(v.obs)}”</div>` : ''}
            ${v.feedback ? `<div class="vis-feedback"><div class="small muted">Feedback enviado ao proprietário${v.feedbackEm ? ' em ' + esc(HH.dateTime(v.feedbackEm)) : ''}</div>${esc(v.feedback)}</div>`
              : v.status === 'Realizada' ? '<div class="vis-feedback pendente small">Feedback pendente: o proprietário ainda não recebeu o retorno desta visita.</div>' : ''}
            ${av ? `<div class="small">Avaliação do cliente: corretor ${HH.stars(av.notaCorretor)} · imóvel ${HH.stars(av.notaImovel)}</div>` : ''}
          </div>
          <div class="vis-acoes">${acoes.join('')}</div>
        </div>`;
      };
      const grupos = (arr) => {
        const g = [];
        arr.forEach((v) => { const k = chaveDia(v.dataHora); let x = g.find((y) => y.k === k); if (!x) g.push((x = { k, d: v.dataHora, itens: [] })); x.itens.push(v); });
        return g.map((x) => `<div class="card vis-dia ${x.k === hojeKey ? 'vis-hoje' : ''}"><div class="card-title"><h3>${esc(diaLabel(x.d))}</h3><span class="badge">${plural(x.itens.length, 'visita', 'visitas')}</span></div>${x.itens.map(item).join('')}</div>`).join('');
      };
      const opts = ['Todas', 'Agendada', 'Realizada', 'Cancelada'];
      return `
        <div class="page-head"><div><h1>Agenda de visitas ${HH.ucTag('UC04')}</h1><p class="sub">Realize as visitas e registre o feedback para o proprietário logo após cada atendimento.</p></div>
          <div class="field vis-filtro"><label for="vis-filtro">Status</label><select class="input" id="vis-filtro" data-vis-filtro>${opts.map((o) => `<option ${o === filtroAgenda ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div></div>
        <div class="grid grid-3">
          <div class="kpi"><div class="label">Visitas hoje</div><div class="value">${todas.filter((v) => v.status !== 'Cancelada' && chaveDia(v.dataHora) === hojeKey).length}</div></div>
          <div class="kpi"><div class="label">Próximas agendadas</div><div class="value">${todas.filter((v) => v.status === 'Agendada' && ts(v.dataHora) >= agora).length}</div></div>
          <div class="kpi ${semFeedback ? 'vis-kpi-alerta' : ''}"><div class="label">Realizadas sem feedback</div><div class="value">${semFeedback}</div></div>
        </div>
        <h2 class="vis-secao">Próximas</h2>
        ${prox.length ? grupos(prox) : '<div class="empty">Nenhuma visita futura com este filtro.</div>'}
        <h2 class="vis-secao">Passadas</h2>
        ${pass.length ? grupos(pass) : '<div class="empty">Nenhuma visita passada com este filtro.</div>'}`;
    },
    mount: (root, { user }) => {
      const f = root.querySelector('[data-vis-filtro]');
      if (f) f.addEventListener('change', () => { filtroAgenda = f.value; HH.render(); });
      root.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-vis-realizar]');
        if (r) {
          const v = HH.find('visitas', r.dataset.visRealizar);
          if (!v || v.status !== 'Agendada') return;
          const im = imv(v.imovelId);
          const futura = ts(v.dataHora) > Date.now();
          const ok = await HH.confirm(futura
            ? `Esta visita está marcada para ${HH.dateTime(v.dataHora)}, que ainda não chegou. Marcar como realizada mesmo assim?`
            : `Confirmar que a visita ao ${im.codigo} com ${usr(v.clienteId).nome} foi realizada?`, { title: 'Marcar como realizada', ok: 'Marcar como realizada' });
          if (!ok) return;
          HH.update('visitas', v.id, { status: 'Realizada', realizadaEm: new Date().toISOString() });
          HH.toast('Visita marcada como realizada. Registre o feedback para o proprietário.', 'ok');
          HH.render();
          abrirFeedback(HH.find('visitas', v.id));
          return;
        }
        const c = e.target.closest('[data-vis-cancelar-eq]');
        if (c) {
          const v = HH.find('visitas', c.dataset.visCancelarEq);
          if (!v || v.status !== 'Agendada') return;
          const im = imv(v.imovelId);
          const ok = await HH.confirm(`Cancelar a visita ao ${im.codigo} com ${usr(v.clienteId).nome} em ${HH.dateTime(v.dataHora)}? O cliente será notificado.`, { title: 'Cancelar visita', ok: 'Cancelar visita', danger: true });
          if (!ok) return;
          HH.update('visitas', v.id, { status: 'Cancelada', canceladaEm: new Date().toISOString() });
          HH.notify(v.clienteId, `Sua visita ao "${im.titulo}" em ${HH.dateTime(v.dataHora)} foi cancelada pela imobiliária. Você pode agendar um novo horário.`, '#/minhas-visitas');
          if (im.proprietarioId) HH.notify(im.proprietarioId, `A visita ao "${im.titulo}" de ${HH.dateTime(v.dataHora)} foi cancelada.`, '#/meus-imoveis/' + im.id);
          HH.toast('Visita cancelada e cliente notificado.', 'ok');
          HH.render();
          return;
        }
        const fb = e.target.closest('[data-vis-feedback]');
        if (fb) { const v = HH.find('visitas', fb.dataset.visFeedback); if (v && v.status === 'Realizada') abrirFeedback(v); }
      });
    },
  });

  // ---------- #/avaliacoes (equipe) ----------
  HH.route('#/avaliacoes', {
    title: 'Avaliações', roles: ['corretor', 'admin'],
    render: () => {
      const avs = HH.db.avaliacoes.slice().sort((a, b) => b.data.localeCompare(a.data));
      const corretores = HH.db.usuarios.filter((u) => u.perfil === 'corretor' || avs.some((a) => a.corretorId === u.id));
      const porCorretor = corretores.map((u) => { const l = avs.filter((a) => a.corretorId === u.id); return { u, n: l.length, m: media(l, 'notaCorretor') }; }).sort((a, b) => b.m - a.m || b.n - a.n);
      const ids = [...new Set(avs.map((a) => a.imovelId))];
      const porImovel = ids.map((id) => { const l = avs.filter((a) => a.imovelId === id); return { im: imv(id), n: l.length, m: media(l, 'notaImovel') }; }).sort((a, b) => b.m - a.m);
      const nota = (m, n) => (n ? `<strong>${fmtMedia(m)}</strong> ${HH.stars(m)}` : '<span class="muted">—</span>');
      return `
        <div class="page-head"><div><h1>Avaliações ${HH.ucTag('UC11')}</h1><p class="sub">Desempenho dos corretores e percepção dos clientes sobre os imóveis visitados.</p></div></div>
        <div class="grid grid-3">
          <div class="kpi"><div class="label">Avaliações recebidas</div><div class="value">${avs.length}</div></div>
          <div class="kpi"><div class="label">Média dos corretores</div><div class="value">${avs.length ? fmtMedia(media(avs, 'notaCorretor')) : '—'}</div>${avs.length ? HH.stars(media(avs, 'notaCorretor')) : ''}</div>
          <div class="kpi"><div class="label">Média dos imóveis</div><div class="value">${avs.length ? fmtMedia(media(avs, 'notaImovel')) : '—'}</div>${avs.length ? HH.stars(media(avs, 'notaImovel')) : ''}</div>
        </div>
        <div class="grid grid-2" style="margin-top:16px">
          <div class="card"><div class="card-title"><h3>Desempenho por corretor</h3></div>
            ${porCorretor.length ? `<table class="table"><thead><tr><th>Corretor</th><th>Avaliações</th><th>Média</th></tr></thead><tbody>
              ${porCorretor.map((x) => `<tr><td><div class="row">${HH.avatar(x.u)} ${esc(x.u.nome)}</div></td><td>${x.n}</td><td>${nota(x.m, x.n)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum corretor cadastrado.</div>'}
          </div>
          <div class="card"><div class="card-title"><h3>Média por imóvel</h3></div>
            ${porImovel.length ? `<table class="table"><thead><tr><th>Imóvel</th><th>Avaliações</th><th>Média</th></tr></thead><tbody>
              ${porImovel.map((x) => `<tr><td><a href="#/imovel/${esc(x.im.id)}">${esc(x.im.codigo)}</a> · ${esc(x.im.titulo)}</td><td>${x.n}</td><td>${nota(x.m, x.n)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum imóvel avaliado.</div>'}
          </div>
        </div>
        <div class="card" style="margin-top:16px"><div class="card-title"><h3>Todas as avaliações</h3></div>
          ${avs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Imóvel</th><th>Corretor</th><th>Nota corretor</th><th>Nota imóvel</th><th>Comentário</th></tr></thead><tbody>
            ${avs.map((a) => { const im = imv(a.imovelId); return `<tr>
              <td>${esc(HH.date(a.data))}</td>
              <td>${a.anonimo ? '<span class="muted">Anônimo</span>' : esc(usr(a.clienteId).nome)}</td>
              <td>${esc(im.codigo)}</td>
              <td>${esc(usr(a.corretorId).nome)}</td>
              <td>${HH.stars(a.notaCorretor)}</td>
              <td>${HH.stars(a.notaImovel)}</td>
              <td class="vis-coment">${a.comentario ? esc(a.comentario) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<div class="empty">Nenhuma avaliação registrada ainda.</div>'}
        </div>`;
    },
  });

  // ---------- Slot: botão "Agendar visita" na página do imóvel ----------
  HH.slot('imovel.detalhe.acoes', {
    order: 10,
    render: ({ imovel, user }) => {
      if (!imovel || !user || user.perfil !== 'cliente') return '';
      const motivo = imovel.proprietarioId === user.id ? 'Você é o proprietário deste imóvel.'
        : imovel.status !== 'Disponível' ? `Imóvel ${String(imovel.status).toLowerCase()}: não aceita novas visitas.` : '';
      const minha = HH.db.visitas.find((v) => v.imovelId === imovel.id && v.clienteId === user.id && v.status === 'Agendada' && ts(v.dataHora) > Date.now());
      return `<button class="btn btn-primary" data-visita-agendar="${esc(imovel.id)}" ${motivo ? 'disabled' : ''} title="${esc(motivo || 'Escolha um horário na agenda do corretor')}">Agendar visita</button>`
        + (motivo ? `<span class="small muted vis-nota">${esc(motivo)}</span>` : '')
        + (minha ? `<span class="small muted vis-nota">Você já tem visita em ${esc(HH.dateTime(minha.dataHora))} · <a href="#/minhas-visitas">Minhas visitas</a></span>` : '');
    },
    mount: (root) => {
      root.querySelectorAll('[data-visita-agendar]').forEach((b) => {
        if (b.dataset.visBound) return;
        b.dataset.visBound = '1';
        b.addEventListener('click', () => {
          const im = HH.find('imoveis', b.dataset.visitaAgendar);
          const u = HH.me();
          if (!im || !u) return;
          if (im.status !== 'Disponível') { HH.toast(MSG_INDISP, 'danger'); return; }
          if (im.proprietarioId === u.id) { HH.toast('Você é o proprietário deste imóvel.', 'warn'); return; }
          abrirAgenda({ imovel: im, user: u });
        });
      });
    },
  });

  // ---------- Slot: card "Visitas e feedbacks" na página do proprietário ----------
  HH.slot('proprietario.imovel', {
    order: 10,
    render: ({ imovel }) => {
      if (!imovel) return '';
      const vs = HH.db.visitas.filter((v) => v.imovelId === imovel.id).sort((a, b) => ts(b.dataHora) - ts(a.dataHora));
      const avs = HH.db.avaliacoes.filter((a) => a.imovelId === imovel.id);
      const m = media(avs, 'notaImovel');
      const realizadas = vs.filter((v) => v.status === 'Realizada').length;
      const agendadas = vs.filter((v) => v.status === 'Agendada').length;
      return `<div class="card vis-prop">
        <div class="card-title"><h3>Visitas e feedbacks ${HH.ucTag(['UC04', 'UC11'])}</h3>
          <div class="vis-prop-media">${avs.length ? `${HH.stars(m)} <strong>${fmtMedia(m)}</strong> <span class="small muted">(${plural(avs.length, 'avaliação', 'avaliações')} do imóvel)</span>` : '<span class="small muted">Imóvel ainda sem avaliações</span>'}</div></div>
        <p class="small muted">${plural(vs.length, 'visita', 'visitas')} · ${plural(realizadas, 'realizada', 'realizadas')} · ${plural(agendadas, 'agendada', 'agendadas')}</p>
        ${vs.length ? `<ul class="timeline">${vs.map((v) => {
          const av = avaliacaoDe(v.id);
          return `<li><div class="row"><span class="when">${esc(HH.dateTime(v.dataHora))}</span>${HH.badge(v.status)}<span class="small muted">Interessado: ${esc(primeiroNome(usr(v.clienteId).nome))}</span></div>
            ${v.feedback ? `<div class="vis-feedback"><div class="small muted">Feedback do corretor ${esc(usr(v.corretorId).nome)}</div>${esc(v.feedback)}</div>`
              : v.status === 'Realizada' ? '<div class="small muted">Aguardando feedback do corretor.</div>' : ''}
            ${av ? `<div class="small">Nota do visitante para o imóvel: ${HH.stars(av.notaImovel)}</div>` : ''}</li>`;
        }).join('')}</ul>` : '<div class="empty">Nenhuma visita agendada para este imóvel até o momento.</div>'}
      </div>`;
    },
  });

  // ---------- Slot: pendências do painel da equipe ----------
  HH.slot('painel.pendencias', {
    order: 20,
    render: ({ user }) => {
      if (!user || !HH.isStaff(user)) return '';
      const agora = Date.now();
      const vs = visitasEquipe(user);
      const semFb = vs.filter((v) => v.status === 'Realizada' && !v.feedback).sort((a, b) => ts(b.dataHora) - ts(a.dataHora));
      const atrasadas = vs.filter((v) => v.status === 'Agendada' && ts(v.dataHora) < agora);
      return semFb.map((v) => { const im = imv(v.imovelId); return `<li><strong>Visita sem feedback</strong> · ${esc(im.codigo)} · ${esc(im.titulo)}<div class="when">Realizada em ${esc(HH.dateTime(v.dataHora))} · o proprietário aguarda o retorno</div><a class="small" href="#/agenda">Registrar feedback na agenda</a></li>`; }).join('')
        + atrasadas.map((v) => { const im = imv(v.imovelId); return `<li><strong>Visita não concluída</strong> · ${esc(im.codigo)} · ${esc(im.titulo)}<div class="when">Agendada para ${esc(HH.dateTime(v.dataHora))} e ainda não marcada como realizada</div><a class="small" href="#/agenda">Abrir agenda</a></li>`; }).join('');
    },
  });
})();
