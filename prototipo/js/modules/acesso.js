/* HabitaHub – fatia vertical: acesso (UC05 Cadastrar Perfil, UC06 Alterar Perfil). Ver prototipo/README.md.
 * Rotas: #/login, #/cadastro (públicas, sem shell) e #/perfil (qualquer usuário logado).
 */
(function () {
  'use strict';
  const { esc } = HH;

  // ---------- Constantes e mensagens da especificação ----------
  const MSG = {
    duplicado: 'E-mail ou CPF já cadastrado no sistema.', // UC05 E1
    senhaFraca: 'A senha deve ter no mínimo 8 caracteres, com pelo menos uma letra e um número.', // UC05 E2
    senhaAtual: 'Senha atual não confere.', // UC06 E1
    cepNaoEncontrado: 'CEP não encontrado. Preencha o endereço manualmente.', // A1 (ViaCEP)
    naoLocalizado: 'Usuário não localizado.', // EE6
    loginInvalido: 'E-mail ou senha inválidos.',
  };
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const ADDR = ['logradouro', 'bairro', 'cidade', 'uf'];
  const TIPOS = [
    { v: 'Cliente', desc: 'Quero comprar ou alugar um imóvel' },
    { v: 'Proprietário', desc: 'Tenho imóveis anunciados pela imobiliária e quero acompanhá-los' },
    { v: 'Interessado', desc: 'Quero acompanhar oportunidades' },
    { v: 'Corretor', desc: 'Profissional com CRECI ativo' },
  ];
  const PERFIL_LABEL = { cliente: 'Cliente', corretor: 'Corretor', admin: 'Administrador' };
  const PREFS_PADRAO = { emailMarketing: false, whatsapp: true, alertaNovos: true };

  const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 14.5h5"/></svg>';
  const ICON_GOOGLE = '<span class="acesso-g" aria-hidden="true">G</span>';
  const ICON_APPLE = '<svg class="acesso-apple" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.2 3-2.5.9-1.4 1.3-2.8 1.3-2.8s-2.6-1-2.6-4.1zM14.1 5.1c.7-.8 1.1-1.9 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>';

  // ---------- Utilitários da fatia ----------
  const digits = HH.onlyDigits;
  const home = (u) => (HH.isStaff(u) ? '#/painel' : '#/catalogo');
  const norm = (e) => String(e || '').trim().toLowerCase();
  const primeiroNome = (n) => String(n || '').split(/\s+/)[0];
  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const emailEmUso = (email, exceto) => HH.db.usuarios.some((u) => u.id !== exceto && norm(u.email) === norm(email));
  const cpfEmUso = (cpf, exceto) => HH.db.usuarios.some((u) => u.id !== exceto && u.cpf && digits(u.cpf) === digits(cpf));
  const buscaEmail = (email) => HH.db.usuarios.find((u) => norm(u.email) === norm(email)) || null;

  const MASKS = {
    cpf: (v) => {
      const d = digits(v).slice(0, 11);
      let o = d.slice(0, 3);
      if (d.length > 3) o += '.' + d.slice(3, 6);
      if (d.length > 6) o += '.' + d.slice(6, 9);
      if (d.length > 9) o += '-' + d.slice(9);
      return o;
    },
    tel: (v) => {
      const d = digits(v).slice(0, 11);
      if (d.length <= 2) return d.length ? '(' + d : '';
      const n = d.length === 11 ? 5 : 4;
      const r = d.slice(2);
      return `(${d.slice(0, 2)}) ` + (r.length > n ? r.slice(0, n) + '-' + r.slice(n) : r);
    },
    cep: (v) => { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; },
  };
  function applyMasks(root) {
    root.querySelectorAll('[data-mask]').forEach((el) => {
      el.addEventListener('input', () => { el.value = MASKS[el.dataset.mask](el.value); });
    });
  }

  // Erros por campo (mensagem abaixo do input) + destaque com HH.markInvalid.
  function setErrors(form, errs) {
    form.querySelectorAll('.acesso-err').forEach((e) => e.remove());
    const names = Object.keys(errs);
    HH.markInvalid(form, names);
    names.forEach((n) => {
      const el = form.elements[n];
      const field = el && el.closest && el.closest('.field');
      if (field) field.insertAdjacentHTML('beforeend', `<span class="error-msg acesso-err">${esc(errs[n])}</span>`);
    });
    if (names[0] && form.elements[names[0]] && form.elements[names[0]].focus) form.elements[names[0]].focus();
  }
  function showAlert(root, msg, type = 'danger') {
    const box = root.querySelector('[data-acesso-alert]');
    if (!box) return HH.toast(msg, type);
    box.innerHTML = msg ? `<div class="alert ${type}">${esc(msg)}</div>` : '';
    if (msg) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---------- Endereço + ViaCEP (AIE1) ----------
  function parseEndereco(u) {
    if (u.enderecoDetalhe) return { ...u.enderecoDetalhe };
    const m = /^(.*),\s*([^,]+)\/([A-Z]{2})$/.exec(u.endereco || '');
    return m ? { logradouro: '', numero: '', complemento: '', bairro: m[1], cidade: m[2], uf: m[3] } : { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
  }
  function comporEndereco(e) {
    const partes = [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro].filter(Boolean).join(' – ');
    return partes + (e.cidade ? (partes ? ', ' : '') + e.cidade + (e.uf ? '/' + e.uf : '') : '');
  }
  function enderecoHtml(v, hint) {
    const val = (k) => esc(v[k] || '');
    return `
      <div class="grid grid-3 acesso-grid">
        <div class="field"><label for="ac-cep">CEP</label>
          <input class="input" id="ac-cep" name="cep" data-mask="cep" inputmode="numeric" placeholder="00000-000" value="${val('cep')}" autocomplete="postal-code">
          <span class="hint" data-cep-status>${esc(hint)}</span></div>
        <div class="field acesso-span2"><label for="ac-log">Logradouro</label><input class="input" id="ac-log" name="logradouro" value="${val('logradouro')}"></div>
      </div>
      <div class="grid grid-3 acesso-grid">
        <div class="field"><label for="ac-num">Número</label><input class="input" id="ac-num" name="numero" value="${val('numero')}"></div>
        <div class="field"><label for="ac-comp">Complemento</label><input class="input" id="ac-comp" name="complemento" value="${val('complemento')}"></div>
        <div class="field"><label for="ac-bairro">Bairro</label><input class="input" id="ac-bairro" name="bairro" value="${val('bairro')}"></div>
      </div>
      <div class="grid grid-3 acesso-grid">
        <div class="field acesso-span2"><label for="ac-cidade">Cidade</label><input class="input" id="ac-cidade" name="cidade" value="${val('cidade')}"></div>
        <div class="field"><label for="ac-uf">UF</label><select class="input" id="ac-uf" name="uf"><option value="">UF</option>${UFS.map((u) => `<option ${v.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>`;
  }
  // Controla a consulta ao ViaCEP ao sair do campo. A1 (não encontrado) e E1 (serviço fora) liberam a digitação manual.
  function mountCep(form, { locked }) {
    const cep = form.elements.cep;
    const status = form.querySelector('[data-cep-status]');
    let ultimo = digits(cep.value);
    let pendente = Promise.resolve();
    let seq = 0;
    const setStatus = (html, cls) => { status.className = 'hint' + (cls ? ' acesso-st-' + cls : ''); status.innerHTML = html; };
    const lock = (el, on) => { if (el.tagName === 'SELECT') el.disabled = on; else el.readOnly = on; el.classList.toggle('acesso-locked', on); };
    const lockAll = (on) => ADDR.forEach((n) => lock(form.elements[n], on));
    lockAll(!!locked);

    function consultar() {
      const d = digits(cep.value);
      if (d === ultimo) return pendente;
      ultimo = d;
      const my = ++seq;
      if (!d) { setStatus('Informe o CEP para preencher o endereço automaticamente.'); return (pendente = Promise.resolve()); }
      if (d.length !== 8) { setStatus('CEP inválido: informe os 8 dígitos.', 'erro'); lockAll(false); return (pendente = Promise.resolve()); }
      setStatus('<span class="spinner acesso-spin"></span> Consultando ViaCEP…');
      pendente = HH.api.viaCep(d).then((r) => {
        if (my !== seq) return;
        if (!r) { // A1: CEP não localizado → preenchimento manual
          setStatus(esc(MSG.cepNaoEncontrado), 'warn');
          HH.toast(MSG.cepNaoEncontrado, 'warn');
          lockAll(false);
          form.elements.logradouro.focus();
          return;
        }
        ADDR.forEach((n) => { const el = form.elements[n]; el.value = r[n] || ''; lock(el, !!r[n]); });
        setStatus('Endereço preenchido automaticamente pelo ViaCEP.', 'ok');
        (r.logradouro ? form.elements.numero : form.elements.logradouro).focus();
      }).catch((e) => { // E1: serviço indisponível → preenchimento manual
        if (my !== seq) return;
        setStatus(esc(e.message), 'erro');
        HH.toast(e.message, 'warn');
        lockAll(false);
      });
      return pendente;
    }
    cep.addEventListener('blur', consultar);
    cep.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); consultar(); } });
    return { consultar, reset: () => { ultimo = digits(cep.value); } };
  }
  function validaEndereco(f, errs, obrigatorio) {
    const temAlgo = digits(f.cep) || f.logradouro || f.cidade;
    if (!obrigatorio && !temAlgo) return;
    if (digits(f.cep).length !== 8) errs.cep = 'Informe um CEP válido (8 dígitos).';
    // No cadastro o logradouro é obrigatório; no perfil, contas antigas podem ter só bairro/cidade.
    if (obrigatorio && !f.logradouro) errs.logradouro = 'Informe o logradouro.';
    if (!f.cidade) errs.cidade = 'Informe a cidade.';
    if (!f.uf) errs.uf = 'Informe a UF.';
  }
  const enderecoDe = (f) => ({ logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, uf: f.uf });

  // ---------- Senha: indicador de força (UC05 E2) ----------
  function forcaSenha(s) {
    if (!s) return { nivel: 0, label: 'Digite uma senha' };
    if (!HH.senhaForte(s)) return { nivel: 1, label: 'Fraca – não atende aos requisitos mínimos' };
    let p = 0;
    if (s.length >= 12) p++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++;
    if (/[^A-Za-z0-9]/.test(s)) p++;
    return p >= 2 ? { nivel: 3, label: 'Forte' } : { nivel: 2, label: 'Média – atende aos requisitos' };
  }
  const meterHtml = () => `
    <div class="acesso-meter" data-meter data-nivel="0">
      <div class="acesso-meter-bar"><span></span><span></span><span></span></div>
      <div class="small" data-meter-label>Digite uma senha</div>
      <ul class="acesso-reqs small">
        <li data-req="len">Mínimo de 8 caracteres</li>
        <li data-req="letra">Pelo menos uma letra</li>
        <li data-req="num">Pelo menos um número</li>
      </ul>
    </div>`;
  function mountMeter(input, meter) {
    const upd = () => {
      const s = input.value;
      const f = forcaSenha(s);
      meter.dataset.nivel = f.nivel;
      meter.querySelector('[data-meter-label]').textContent = f.label;
      meter.querySelector('[data-req=len]').classList.toggle('ok', s.length >= 8);
      meter.querySelector('[data-req=letra]').classList.toggle('ok', /[A-Za-z]/.test(s));
      meter.querySelector('[data-req=num]').classList.toggle('ok', /\d/.test(s));
    };
    input.addEventListener('input', upd);
    upd();
  }
  // Botão "mostrar/ocultar senha"
  function mountOlhos(root) {
    root.querySelectorAll('[data-acesso-olho]').forEach((b) => b.addEventListener('click', () => {
      const inp = b.parentElement.querySelector('input');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.textContent = show ? 'Ocultar' : 'Mostrar';
    }));
  }
  const senhaInput = (name, id, auto, ph = '') => `<div class="acesso-pass"><input class="input" type="password" id="${id}" name="${name}" autocomplete="${auto}" placeholder="${esc(ph)}"><button type="button" class="btn btn-sm btn-ghost" data-acesso-olho>Mostrar</button></div>`;

  // ---------- Preferências de notificação (ALI 3) ----------
  const prefsHtml = (p) => `
    <label class="check"><input type="checkbox" name="emailMarketing" ${p.emailMarketing ? 'checked' : ''}> Receber e-mail marketing</label>
    <label class="check"><input type="checkbox" name="whatsapp" ${p.whatsapp ? 'checked' : ''}> Receber notificações pelo WhatsApp</label>
    <label class="check"><input type="checkbox" name="alertaNovos" ${p.alertaNovos ? 'checked' : ''}> Alerta de novos imóveis</label>`;
  const prefsDe = (f) => ({ emailMarketing: !!f.emailMarketing, whatsapp: !!f.whatsapp, alertaNovos: !!f.alertaNovos });

  // ---------- Simulador local das telas públicas ----------
  // O painel do shell só aparece para usuários logados; nas telas sem shell oferecemos um atalho equivalente.
  function abrirSimulador() {
    const keys = ['viacep', 'creci', 'oauth'];
    HH.modal({
      title: 'Simulador de APIs',
      body: `<p class="small muted">Force as respostas das integrações usadas no cadastro e no login para demonstrar os fluxos alternativos e de exceção.</p>
        <form class="form" id="acesso-sim-form">${keys.map((k) => {
          const o = HH.api.OPTIONS[k];
          return `<div class="field"><label>${esc(o.label)}</label><select class="input" name="${k}">${Object.entries(o.values).map(([v, l]) => `<option value="${esc(v)}" ${HH.db.sim[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
        }).join('')}</form>`,
      onMount: (root) => root.querySelector('#acesso-sim-form').addEventListener('change', (e) => {
        HH.db.sim[e.target.name] = e.target.value; HH.save();
        const o = HH.api.OPTIONS[e.target.name];
        HH.toast(`${o.label}: ${o.values[e.target.value]}`);
      }),
    });
  }

  const brandHtml = (sub) => `<div class="acesso-brand"><div class="logo">${LOGO} HabitaHub</div>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>`;
  const redirecionarLogado = (user) => { setTimeout(() => location.replace(home(user)), 0); return '<div class="empty">Redirecionando…</div>'; };

  // Cria uma conta de cliente a partir do login social (AIE6) quando o e-mail ainda não existe.
  function criarContaSocial(r) {
    return HH.insert('usuarios', {
      id: HH.uid('u'), nome: r.nome, email: r.email, cpf: '', telefone: '', cep: '', endereco: '',
      senha: null, perfil: 'cliente', tipoPerfil: 'Cliente', prefs: { ...PREFS_PADRAO }, foto: null,
      criadoEm: new Date().toISOString(), provedorSocial: r.provedor, socialToken: r.token,
    });
  }

  // =====================================================================
  // #/login
  // =====================================================================
  HH.route('#/login', {
    title: 'Entrar', roles: 'public', bare: true,
    render: ({ user }) => {
      if (user) return redirecionarLogado(user);
      const demos = HH.db.usuarios.filter((u) => /@habitahub\.demo$/i.test(u.email));
      return `
      <div class="auth-card acesso-scope">
        ${brandHtml('Encontre, visite e negocie imóveis em um só lugar.')}
        <div class="card">
          <div class="row between"><h1 style="margin:0">Entrar</h1><button type="button" class="btn btn-sm btn-ghost" data-acesso-sim title="Simulador de APIs">⚙ Simulador</button></div>
          <p class="muted">Acesse com seu e-mail e senha.</p>
          <div data-acesso-alert></div>
          <form class="form" id="acesso-login" novalidate>
            <div class="field"><label for="lg-email">E-mail</label><input class="input" type="email" id="lg-email" name="email" autocomplete="username" placeholder="voce@exemplo.com"></div>
            <div class="field"><label for="lg-senha">Senha</label>${senhaInput('senha', 'lg-senha', 'current-password')}</div>
            <button class="btn btn-primary acesso-block" type="submit">Entrar</button>
          </form>
          <div class="acesso-divider"><span>ou</span></div>
          <div class="acesso-social">
            <button type="button" class="btn acesso-block" data-acesso-oauth="Google">${ICON_GOOGLE} Entrar com Google</button>
            <button type="button" class="btn acesso-block acesso-btn-apple" data-acesso-oauth="Apple">${ICON_APPLE} Entrar com Apple</button>
          </div>
          <p class="acesso-center">Ainda não tem conta? <a href="#/cadastro"><strong>Criar conta</strong></a></p>
        </div>
        <div class="card">
          <div class="card-title"><h3 style="margin:0">Contas de demonstração</h3><span class="small muted">senha <code>demo1234</code></span></div>
          ${demos.length ? `<ul class="acesso-demos">${demos.map((u) => `
            <li>${HH.avatar(u)}<div class="acesso-demo-info"><strong>${esc(u.nome)}</strong><span class="small muted">${esc(PERFIL_LABEL[u.perfil] || u.perfil)} · ${esc(u.email)}</span></div>
              <button type="button" class="btn btn-sm" data-acesso-demo="${esc(u.email)}">Acessar</button></li>`).join('')}</ul>`
            : '<div class="empty">Nenhuma conta de demonstração. Restaure os dados no simulador.</div>'}
        </div>
      </div>`;
    },
    mount: (root, { user }) => {
      if (user) return;
      const form = root.querySelector('#acesso-login');
      mountOlhos(root);
      root.querySelector('[data-acesso-sim]').addEventListener('click', abrirSimulador);

      function entrar(email, senha) {
        showAlert(root, '');
        const errs = {};
        if (!email) errs.email = 'Informe o e-mail.';
        if (!senha) errs.senha = 'Informe a senha.';
        if (Object.keys(errs).length) return setErrors(form, errs);
        const u = buscaEmail(email);
        if (!u || !u.senha || u.senha !== HH.hash(senha)) {
          setErrors(form, {});
          HH.markInvalid(form, ['email', 'senha']);
          const msg = u && !u.senha && u.provedorSocial
            ? `Esta conta foi criada com ${u.provedorSocial}. Use o botão "Entrar com ${u.provedorSocial}". Depois, se quiser, defina uma senha em "Meu perfil".`
            : MSG.loginInvalido;
          return showAlert(root, msg);
        }
        HH.login(u.id);
        HH.toast(`Olá, ${primeiroNome(u.nome)}!`, 'ok');
        HH.go(home(u));
      }
      form.addEventListener('submit', (e) => { e.preventDefault(); const f = HH.formData(form); entrar(f.email, form.elements.senha.value); });

      root.querySelectorAll('[data-acesso-demo]').forEach((b) => b.addEventListener('click', () => {
        form.elements.email.value = b.dataset.acessoDemo;
        form.elements.senha.value = 'demo1234';
        entrar(b.dataset.acessoDemo, 'demo1234');
      }));

      // AIE6 – login social: e-mail existente entra; senão cria um cliente e leva a completar o perfil.
      root.querySelectorAll('[data-acesso-oauth]').forEach((b) => b.addEventListener('click', async () => {
        showAlert(root, '');
        const provedor = b.dataset.acessoOauth;
        let r;
        try { r = await HH.busy(b, HH.api.oauth(provedor)); } catch (e) { return showAlert(root, e.message, 'warn'); }
        const existente = buscaEmail(r.email);
        if (existente) {
          HH.login(existente.id);
          HH.toast(`Olá, ${primeiroNome(existente.nome)}! Login com ${provedor} realizado.`, 'ok');
          return HH.go(home(existente));
        }
        const u = criarContaSocial(r);
        HH.login(u.id);
        HH.notify(u.id, `Conta criada com ${provedor}. Complete seu perfil informando CPF e telefone.`, '#/perfil');
        HH.toast(`Conta criada com ${provedor}. Complete seu perfil.`, 'ok');
        HH.go('#/perfil?completar=1');
      }));
    },
  });

  // =====================================================================
  // #/cadastro – UC05
  // =====================================================================
  HH.route('#/cadastro', {
    title: 'Criar conta', roles: 'public', bare: true,
    render: ({ user }) => {
      if (user) return redirecionarLogado(user);
      return `
      <div class="acesso-scope acesso-wide">
        ${brandHtml('')}
        <div class="card">
          <div class="page-head" style="margin-bottom:12px">
            <div><h1>Criar conta ${HH.ucTag('UC05')}</h1><p class="sub">Preencha seus dados para acessar o HabitaHub.</p></div>
            <button type="button" class="btn btn-sm btn-ghost" data-acesso-sim title="Simulador de APIs">⚙ Simulador</button>
          </div>

          <div class="acesso-social-box" data-acesso-social-box>
            <div class="small muted">Cadastro rápido vinculando uma conta externa:</div>
            <div class="row">
              <button type="button" class="btn" data-acesso-oauth="Google">${ICON_GOOGLE} Cadastrar com Google</button>
              <button type="button" class="btn acesso-btn-apple" data-acesso-oauth="Apple">${ICON_APPLE} Cadastrar com Apple</button>
            </div>
          </div>
          <div data-acesso-social-info></div>
          <div class="acesso-divider"><span>ou preencha o formulário</span></div>

          <form class="form" id="acesso-cadastro" novalidate>
            <div data-acesso-alert></div>

            <h3>Tipo de perfil</h3>
            <div class="acesso-tipos">
              ${TIPOS.map((t, i) => `<label class="acesso-tipo"><input type="radio" name="tipoPerfil" value="${esc(t.v)}" ${i === 0 ? 'checked' : ''}><span><strong>${esc(t.v)}</strong><span class="small muted">${esc(t.desc)}</span></span></label>`).join('')}
            </div>

            <h3>Dados pessoais</h3>
            <div class="grid grid-2 acesso-grid">
              <div class="field acesso-span-all"><label for="cd-nome">Nome completo</label><input class="input" id="cd-nome" name="nome" autocomplete="name"></div>
              <div class="field"><label for="cd-email">E-mail</label><input class="input" type="email" id="cd-email" name="email" autocomplete="email" placeholder="voce@exemplo.com"></div>
              <div class="field"><label for="cd-cpf">CPF</label><input class="input" id="cd-cpf" name="cpf" data-mask="cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
              <div class="field"><label for="cd-tel">Telefone / WhatsApp</label><input class="input" id="cd-tel" name="telefone" data-mask="tel" inputmode="numeric" placeholder="(00) 00000-0000" autocomplete="tel"></div>
            </div>
            <div class="grid grid-2 acesso-grid hidden" data-acesso-corretor>
              <div class="field"><label for="cd-creci">Número do CRECI</label><input class="input" id="cd-creci" name="creci" placeholder="00000-F"><span class="hint">Validado junto ao CRECI no envio.</span></div>
              <div class="field"><label for="cd-creci-uf">UF da inscrição</label><select class="input" id="cd-creci-uf" name="creciUf"><option value="">Selecione</option>${UFS.map((u) => `<option>${u}</option>`).join('')}</select></div>
            </div>

            <h3>Endereço</h3>
            ${enderecoHtml({}, 'Informe o CEP para preencher o endereço automaticamente.')}

            <div data-acesso-senha-block>
              <h3>Senha de acesso</h3>
              <div class="grid grid-2 acesso-grid">
                <div class="field"><label for="cd-senha">Senha</label>${senhaInput('senha', 'cd-senha', 'new-password')}</div>
                <div class="field"><label for="cd-conf">Confirmar senha</label>${senhaInput('confirmacao', 'cd-conf', 'new-password')}</div>
              </div>
              ${meterHtml()}
            </div>

            <h3>Preferências de notificação</h3>
            ${prefsHtml(PREFS_PADRAO)}

            <div class="row between acesso-actions">
              <a class="btn" href="#/login">Voltar</a>
              <div class="row">
                <button type="button" class="btn" data-acesso-limpar>Limpar</button>
                <button type="submit" class="btn btn-primary">Finalizar Cadastro</button>
              </div>
            </div>
          </form>
        </div>
        <p class="acesso-center">Já tem conta? <a href="#/login">Entrar</a></p>
      </div>`;
    },
    mount: (root, { user }) => {
      if (user) return;
      const form = root.querySelector('#acesso-cadastro');
      const corretorBox = root.querySelector('[data-acesso-corretor]');
      const senhaBlock = root.querySelector('[data-acesso-senha-block]');
      const socialInfo = root.querySelector('[data-acesso-social-info]');
      let social = null; // { provedor, token, email, nome }

      applyMasks(root);
      mountOlhos(root);
      mountMeter(form.elements.senha, root.querySelector('[data-meter]'));
      const cepCtl = mountCep(form, { locked: true });
      root.querySelector('[data-acesso-sim]').addEventListener('click', abrirSimulador);
      root.querySelector('[data-acesso-limpar]').addEventListener('click', () => { HH.render(); HH.toast('Formulário limpo.'); });

      const tipoAtual = () => (form.querySelector('[name=tipoPerfil]:checked') || {}).value || 'Cliente';
      form.querySelectorAll('[name=tipoPerfil]').forEach((r) => r.addEventListener('change', () => {
        corretorBox.classList.toggle('hidden', tipoAtual() !== 'Corretor');
      }));

      // A1 – cadastro social: vincula a conta externa e pré-preenche nome e e-mail.
      function vincular(r) {
        social = r;
        form.elements.nome.value = r.nome;
        form.elements.email.value = r.email;
        form.elements.email.readOnly = true;
        form.elements.email.classList.add('acesso-locked');
        senhaBlock.classList.add('hidden');
        socialInfo.innerHTML = `<div class="alert info row between"><span>Conta <strong>${esc(r.provedor)}</strong> vinculada: ${esc(r.email)}. Complete CPF, telefone e endereço para finalizar o cadastro. ${HH.ucTag('UC05 · A1')}</span><button type="button" class="btn btn-sm" data-acesso-desvincular>Desvincular</button></div>`;
        socialInfo.querySelector('[data-acesso-desvincular]').addEventListener('click', () => {
          social = null;
          form.elements.email.readOnly = false;
          form.elements.email.classList.remove('acesso-locked');
          form.elements.email.value = '';
          senhaBlock.classList.remove('hidden');
          socialInfo.innerHTML = '';
        });
        form.elements.cpf.focus();
      }
      root.querySelectorAll('[data-acesso-oauth]').forEach((b) => b.addEventListener('click', async () => {
        showAlert(form, '');
        let r;
        try { r = await HH.busy(b, HH.api.oauth(b.dataset.acessoOauth)); } catch (e) { return showAlert(form, e.message, 'warn'); }
        if (emailEmUso(r.email)) return showAlert(form, MSG.duplicado + ' Use a opção "Entrar" para acessar sua conta.');
        vincular(r);
        HH.toast(`Conta ${r.provedor} vinculada.`, 'ok');
      }));

      async function finalizar() {
        showAlert(form, '');
        await cepCtl.consultar(); // garante que a consulta ao ViaCEP terminou
        const f = HH.formData(form);
        const tipo = tipoAtual();
        const senha = form.elements.senha.value;
        const conf = form.elements.confirmacao.value;
        const errs = {};

        if (!f.nome) errs.nome = 'Informe o nome completo.';
        else if (f.nome.split(/\s+/).length < 2) errs.nome = 'Informe o nome completo (nome e sobrenome).';
        if (!f.email) errs.email = 'Informe o e-mail.';
        else if (!emailValido(f.email)) errs.email = 'Formato de e-mail inválido.';
        if (!f.cpf) errs.cpf = 'Informe o CPF.';
        else if (!HH.validaCPF(f.cpf)) errs.cpf = 'CPF inválido. Verifique os dígitos informados.'; // RN1
        if (digits(f.telefone).length < 10) errs.telefone = 'Informe um telefone válido com DDD.';
        validaEndereco(f, errs, true);
        if (tipo === 'Corretor') {
          if (!f.creci) errs.creci = 'Informe o número do CRECI.';
          if (!f.creciUf) errs.creciUf = 'Informe a UF do CRECI.';
        }
        if (!social) {
          if (!HH.senhaForte(senha)) errs.senha = MSG.senhaFraca; // E2
          else if (senha !== conf) errs.confirmacao = 'As senhas não conferem.';
        }
        if (Object.keys(errs).length) {
          setErrors(form, errs);
          return showAlert(form, errs.senha === MSG.senhaFraca && Object.keys(errs).length === 1 ? MSG.senhaFraca : 'Corrija os campos destacados para continuar.');
        }

        // E1 / RN1 – unicidade de e-mail e CPF
        const dupEmail = emailEmUso(f.email);
        const dupCpf = cpfEmUso(f.cpf);
        if (dupEmail || dupCpf) {
          const d = {};
          if (dupEmail) d.email = 'Já cadastrado.';
          if (dupCpf) d.cpf = 'Já cadastrado.';
          setErrors(form, d);
          return showAlert(form, MSG.duplicado);
        }
        setErrors(form, {});

        // Corretor: valida o registro na API CRECI (AIE2)
        let creciOk = null;
        if (tipo === 'Corretor') {
          try { creciOk = await HH.api.creci(f.creci, f.creciUf, f.nome); } catch (e) {
            setErrors(form, { creci: e.message });
            return showAlert(form, e.message);
          }
        }

        const end = enderecoDe(f);
        const u = HH.insert('usuarios', {
          id: HH.uid('u'),
          nome: f.nome, email: f.email.toLowerCase(), cpf: digits(f.cpf), telefone: f.telefone,
          cep: MASKS.cep(f.cep), endereco: comporEndereco(end), enderecoDetalhe: end,
          senha: social ? null : HH.hash(senha), // grava apenas o hash
          perfil: tipo === 'Corretor' ? 'corretor' : 'cliente', tipoPerfil: tipo,
          ...(creciOk ? { creci: creciOk.numero, creciUf: creciOk.uf } : {}),
          prefs: prefsDe(f), foto: null, criadoEm: new Date().toISOString(),
          ...(social ? { provedorSocial: social.provedor, socialToken: social.token } : {}),
        });
        HH.notify(u.id, `Bem-vindo(a) ao HabitaHub, ${primeiroNome(u.nome)}! Sua conta está ativa.`, '#/perfil');
        if (u.perfil === 'corretor') HH.notifyStaff(`Novo corretor cadastrado: ${u.nome} (CRECI ${u.creci}/${u.creciUf}).`, '');
        HH.login(u.id);
        HH.go(home(u));
        HH.modal({
          title: 'Boas-vindas!',
          body: `<div class="acesso-welcome"><div class="logo">${LOGO}</div>
            <p><strong>Bem-vindo(a) ao HabitaHub, ${esc(primeiroNome(u.nome))}!</strong></p>
            <p class="muted">Seu cadastro foi concluído e sua conta de ${esc(tipo)} já está ativa. Você pode atualizar seus dados a qualquer momento em "Meu perfil".</p></div>`,
          actions: [{ label: 'Começar', class: 'btn-primary' }],
        });
      }
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type=submit]');
        HH.busy(btn, finalizar()).catch((err) => { console.error(err); showAlert(form, 'Não foi possível concluir o cadastro: ' + err.message); });
      });
    },
  });

  // =====================================================================
  // #/perfil – UC06
  // =====================================================================
  function tratarFoto(file) {
    return new Promise((resolve, reject) => {
      if (!file.type || !/^image\//.test(file.type)) return reject(new Error('Selecione um arquivo de imagem (JPG, PNG ou WebP).'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('A imagem deve ter no máximo 5 MB.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.onload = () => {
        const raw = reader.result;
        // Reduz para no máximo 320px para não estourar o localStorage.
        const img = new Image();
        img.onload = () => {
          try {
            const max = 320;
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.85));
          } catch (e) { resolve(raw); }
        };
        img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
        img.src = raw;
      };
      reader.readAsDataURL(file);
    });
  }

  HH.route('#/perfil', {
    title: 'Meu perfil',
    render: ({ user, query }) => {
      const u = user;
      const end = { ...parseEndereco(u), cep: u.cep };
      const incompleto = !u.cpf || !u.telefone;
      const temSenha = !!u.senha;
      const qtdImoveis = (HH.db.imoveis || []).filter((i) => i.proprietarioId === u.id).length;
      const tipoLabel = u.perfil === 'cliente' ? (u.tipoPerfil || 'Cliente') : PERFIL_LABEL[u.perfil];
      return `
      <div class="acesso-scope">
        <div class="page-head"><div><h1>Meu perfil ${HH.ucTag('UC06')}</h1><p class="sub">Atualize seus dados cadastrais, telefone, foto, senha e preferências.</p></div></div>
        ${incompleto ? `<div class="alert ${query.completar ? 'info' : 'warn'}">Informe ${!u.cpf ? 'CPF' : ''}${!u.cpf && !u.telefone ? ' e ' : ''}${!u.telefone ? 'telefone' : ''}. ${!u.cpf && !u.telefone ? 'Eles são necessários' : 'Esse dado é necessário'} para gerar contratos.</div>` : ''}
        <div class="acesso-perfil">
          <aside class="card acesso-side">
            <div class="acesso-avatar-xl" data-acesso-preview>${u.foto ? `<img src="${esc(u.foto)}" alt="Foto de perfil">` : esc(HH.initials(u.nome))}</div>
            <h2 class="acesso-center" style="margin-top:12px">${esc(u.nome)}</h2>
            <div class="acesso-center"><span class="badge primary">${esc(PERFIL_LABEL[u.perfil] || u.perfil)}</span>${u.perfil === 'cliente' && u.tipoPerfil && u.tipoPerfil !== 'Cliente' ? ` <span class="badge">${esc(u.tipoPerfil)}</span>` : ''}</div>
            <dl class="acesso-dl">
              <dt>E-mail</dt><dd>${esc(u.email)}</dd>
              <dt>CPF</dt><dd>${u.cpf ? esc(HH.formatCPF(u.cpf)) : '<span class="muted">Não informado</span>'}</dd>
              ${u.creci ? `<dt>CRECI</dt><dd>${esc(u.creci)}${u.creciUf ? ' / ' + esc(u.creciUf) : ''}</dd>` : ''}
              ${qtdImoveis ? `<dt>Imóveis</dt><dd>Proprietário de ${qtdImoveis} imóve${qtdImoveis > 1 ? 'is' : 'l'}</dd>` : ''}
              ${u.provedorSocial ? `<dt>Login social</dt><dd>Vinculado ao ${esc(u.provedorSocial)}</dd>` : ''}
              <dt>Conta criada em</dt><dd>${HH.date(u.criadoEm)}</dd>
            </dl>
            <div class="acesso-foto">
              <div class="small" style="font-weight:600;margin-bottom:6px">Foto de perfil ${HH.ucTag('A1')}</div>
              <input type="file" accept="image/*" id="acesso-foto-input" class="hidden">
              <div class="row">
                <label for="acesso-foto-input" class="btn btn-sm">Escolher imagem…</label>
                <button type="button" class="btn btn-sm btn-primary" data-acesso-foto-salvar disabled>Atualizar Foto</button>
                ${u.foto ? '<button type="button" class="btn btn-sm btn-ghost" data-acesso-foto-remover>Remover</button>' : ''}
              </div>
              <div class="hint small muted" data-acesso-foto-hint>JPG, PNG ou WebP até 5 MB.</div>
            </div>
          </aside>

          <form class="card form acesso-main" id="acesso-perfil" novalidate>
            <div data-acesso-alert></div>
            <h3>Dados pessoais</h3>
            <div class="grid grid-2 acesso-grid">
              <div class="field acesso-span-all"><label for="pf-nome">Nome completo</label><input class="input" id="pf-nome" name="nome" value="${esc(u.nome)}" autocomplete="name"></div>
              <div class="field"><label for="pf-email">E-mail</label><input class="input acesso-locked" id="pf-email" value="${esc(u.email)}" readonly><span class="hint">O e-mail não pode ser alterado por esta tela.</span></div>
              <div class="field"><label for="pf-cpf">CPF</label>${u.cpf
                ? `<input class="input acesso-locked" id="pf-cpf" value="${esc(HH.formatCPF(u.cpf))}" readonly><span class="hint">O CPF não pode ser alterado por esta tela.</span>`
                : `<input class="input" id="pf-cpf" name="cpf" data-mask="cpf" inputmode="numeric" placeholder="000.000.000-00"><span class="hint">Informe o CPF para completar o cadastro. Depois de salvo, não poderá ser alterado.</span>`}</div>
              <div class="field"><label for="pf-tel">Telefone / WhatsApp</label><input class="input" id="pf-tel" name="telefone" data-mask="tel" inputmode="numeric" placeholder="(00) 00000-0000" value="${esc(u.telefone)}"></div>
              <div class="field"><label for="pf-tipo">Tipo de perfil</label>${u.perfil === 'cliente'
                ? `<select class="input" id="pf-tipo" name="tipoPerfil">${['Cliente', 'Proprietário', 'Interessado'].map((t) => `<option ${tipoLabel === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`
                : `<input class="input acesso-locked" id="pf-tipo" value="${esc(tipoLabel)}" readonly>`}</div>
            </div>

            <h3>Endereço</h3>
            ${enderecoHtml(end, u.cep ? 'Altere o CEP para atualizar o endereço automaticamente.' : 'Informe o CEP para preencher o endereço automaticamente.')}

            <h3>Preferências de notificação</h3>
            ${prefsHtml({ ...PREFS_PADRAO, ...(u.prefs || {}) })}

            <h3 style="margin-top:12px">${temSenha ? 'Alterar senha' : 'Definir senha'}</h3>
            <p class="small muted">${temSenha ? 'Preencha apenas se quiser trocar a senha. A senha atual será solicitada para confirmar.' : `Sua conta usa login com ${esc(u.provedorSocial || 'provedor social')}. Defina uma senha para entrar também com e-mail.`}</p>
            <div class="grid grid-3 acesso-grid">
              ${temSenha ? `<div class="field"><label for="pf-atual">Senha atual</label>${senhaInput('senhaAtual', 'pf-atual', 'current-password')}</div>` : ''}
              <div class="field"><label for="pf-nova">Nova senha</label>${senhaInput('novaSenha', 'pf-nova', 'new-password')}</div>
              <div class="field"><label for="pf-conf">Confirmar nova senha</label>${senhaInput('confirmacao', 'pf-conf', 'new-password')}</div>
            </div>
            <div data-acesso-meter-wrap class="hidden">${meterHtml()}</div>

            <div class="row end acesso-actions">
              <button type="button" class="btn" data-acesso-descartar>Descartar</button>
              <button type="submit" class="btn btn-primary">Salvar Alterações</button>
            </div>
          </form>
        </div>
      </div>`;
    },
    mount: (root, { user, query }) => {
      const form = root.querySelector('#acesso-perfil');
      applyMasks(root);
      mountOlhos(root);
      const cepCtl = mountCep(form, { locked: false });
      const nova = form.elements.novaSenha;
      const meterWrap = root.querySelector('[data-acesso-meter-wrap]');
      mountMeter(nova, meterWrap.querySelector('[data-meter]'));
      nova.addEventListener('input', () => meterWrap.classList.toggle('hidden', !nova.value));
      if (query.completar && form.elements.cpf) form.elements.cpf.focus();

      root.querySelector('[data-acesso-descartar]').addEventListener('click', () => { HH.render(); HH.toast('Alterações descartadas.'); });

      // A1 – alteração apenas da foto
      const fileInput = root.querySelector('#acesso-foto-input');
      const btnFoto = root.querySelector('[data-acesso-foto-salvar]');
      const preview = root.querySelector('[data-acesso-preview]');
      const fotoHint = root.querySelector('[data-acesso-foto-hint]');
      let fotoPendente = null;
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          fotoPendente = await tratarFoto(file);
          preview.innerHTML = '';
          const img = document.createElement('img');
          img.src = fotoPendente; img.alt = 'Pré-visualização da foto';
          preview.appendChild(img);
          btnFoto.disabled = false;
          fotoHint.textContent = `Pré-visualização de "${file.name}". Clique em "Atualizar Foto" para salvar.`;
          fotoHint.className = 'hint small acesso-st-ok';
        } catch (e) {
          fotoPendente = null; btnFoto.disabled = true;
          fotoHint.textContent = e.message; fotoHint.className = 'hint small acesso-st-erro';
          HH.toast(e.message, 'danger');
        }
        fileInput.value = '';
      });
      btnFoto.addEventListener('click', () => {
        const u = HH.find('usuarios', HH.db.sessao);
        if (!u) return showAlert(form, MSG.naoLocalizado);
        if (!fotoPendente) return;
        HH.update('usuarios', u.id, { foto: fotoPendente });
        HH.toast('Foto de perfil atualizada com sucesso.', 'ok');
        HH.render();
      });
      const btnRemover = root.querySelector('[data-acesso-foto-remover]');
      if (btnRemover) btnRemover.addEventListener('click', async () => {
        if (!(await HH.confirm('Deseja remover sua foto de perfil?', { title: 'Remover foto', ok: 'Remover', danger: true }))) return;
        HH.update('usuarios', user.id, { foto: null });
        HH.toast('Foto de perfil removida.', 'ok');
        HH.render();
      });

      async function salvar() {
        showAlert(form, '');
        const u = HH.find('usuarios', HH.db.sessao);
        if (!u) return showAlert(form, MSG.naoLocalizado);
        await cepCtl.consultar();
        const f = HH.formData(form);
        const errs = {};
        const completandoCpf = !u.cpf;

        if (!f.nome) errs.nome = 'Informe o nome completo.';
        else if (f.nome.split(/\s+/).length < 2) errs.nome = 'Informe o nome completo (nome e sobrenome).';
        if (completandoCpf) {
          if (!f.cpf) errs.cpf = 'Informe o CPF.';
          else if (!HH.validaCPF(f.cpf)) errs.cpf = 'CPF inválido. Verifique os dígitos informados.';
        }
        if (digits(f.telefone).length < 10) errs.telefone = 'Informe um telefone válido com DDD.';
        validaEndereco(f, errs, false);

        // Troca de senha: confirma a senha atual (E1) e valida a força da nova (UC05 E2).
        const atual = form.elements.senhaAtual ? form.elements.senhaAtual.value : '';
        const novaS = form.elements.novaSenha.value;
        const conf = form.elements.confirmacao.value;
        const trocaSenha = !!(atual || novaS || conf);
        let erroSenhaAtual = false;
        if (trocaSenha) {
          if (u.senha) {
            if (!atual) errs.senhaAtual = 'Informe a senha atual para confirmar a troca.';
            else if (HH.hash(atual) !== u.senha) { errs.senhaAtual = MSG.senhaAtual; erroSenhaAtual = true; }
          }
          if (!HH.senhaForte(novaS)) errs.novaSenha = MSG.senhaFraca;
          else if (u.senha && HH.hash(novaS) === u.senha) errs.novaSenha = 'A nova senha deve ser diferente da atual.';
          else if (novaS !== conf) errs.confirmacao = 'As senhas não conferem.';
        }

        if (Object.keys(errs).length) {
          setErrors(form, errs);
          return showAlert(form, erroSenhaAtual ? MSG.senhaAtual : 'Corrija os campos destacados para salvar.');
        }
        // RN1 do UC05: CPF único (apenas quando o cadastro está sendo completado)
        if (completandoCpf && cpfEmUso(f.cpf, u.id)) {
          setErrors(form, { cpf: 'Já cadastrado.' });
          return showAlert(form, MSG.duplicado);
        }
        setErrors(form, {});

        // RN1 do UC06: e-mail e CPF existentes nunca são alterados aqui.
        const end = enderecoDe(f);
        const patch = {
          nome: f.nome, telefone: f.telefone, prefs: prefsDe(f),
          cep: digits(f.cep) ? MASKS.cep(f.cep) : '', endereco: comporEndereco(end), enderecoDetalhe: end,
        };
        if (u.perfil === 'cliente' && f.tipoPerfil) patch.tipoPerfil = f.tipoPerfil;
        if (completandoCpf) patch.cpf = digits(f.cpf);
        if (trocaSenha) patch.senha = HH.hash(novaS);
        HH.update('usuarios', u.id, patch);

        const completo = !!(HH.find('usuarios', u.id).cpf && patch.telefone);
        HH.toast(trocaSenha ? 'Perfil e senha atualizados com sucesso.' : 'Perfil atualizado com sucesso.', 'ok');
        if (trocaSenha) HH.notify(u.id, 'Sua senha de acesso foi alterada.', '#/perfil');
        if (query.completar && completo) { HH.toast('Cadastro completo! Bem-vindo(a) ao HabitaHub.', 'ok'); return HH.go(home(u)); }
        HH.render();
      }
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type=submit]');
        HH.busy(btn, salvar()).catch((err) => { console.error(err); showAlert(form, 'Não foi possível salvar: ' + err.message); });
      });
    },
  });

  HH.nav({ label: 'Meu perfil', href: '#/perfil', group: 'Conta', order: 90 });
})();
