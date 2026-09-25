/* HabitaHub – fatia vertical 5: Contrato (UC09 Gerar Contrato, UC10 Alterar Contrato,
 * UC12 Importar Assinaturas de Contrato). Ver prototipo/README.md.
 *
 * Rotas: #/contratos, #/contratos/novo/:propostaId, #/contratos/:id (equipe) e #/meus-contratos (cliente).
 * Slots contribuídos: proprietario.imovel (card "Contrato") e painel.pendencias.
 * Campo extra (local da fatia): contratos[].historico[{ data, versao, texto, usuarioId }]
 * guarda o histórico de versões; contratos sem ele (seed) mostram a emissão a partir de criadoEm.
 */
(function () {
  'use strict';
  const { esc } = HH;
  const STAFF = ['corretor', 'admin'];
  const AG = 'Aguardando Assinaturas';
  const VIG = 'Vigente';
  const REC = 'Recusado pelo Assinante';

  // Mensagens exatas da especificação.
  const MSG = {
    restricao: 'Proponente possui restrições financeiras graves. Deseja prosseguir?',
    pendente: 'Análise de crédito pendente',
    motivo: "O campo 'Justificativa/Motivo' é obrigatório.",
    rn1Emissao: 'A emissão definitiva do contrato depende da análise cadastral e da prévia aprovação da proposta.',
    rn1Aditivo: 'Contratos com status "Assinado" ou "Vigente" não podem ter seu texto original sobrescrito; qualquer modificação deve ser obrigatoriamente realizada via Termo Aditivo registrado.',
    rn1Vigencia: 'O contrato só é considerado validado e vigente no HabitaHub após o recebimento e validação da assinatura digital de todas as partes do contrato.',
    naoEncontrado: 'Contrato não encontrado.',
    propostaInvalida: 'Proposta inválida para geração de contrato.',
  };

  // ---------- Helpers de domínio ----------
  const usuario = (id) => (id ? HH.find('usuarios', id) : null);
  const tipoDe = (im) => (im && im.modalidade === 'Aluguel' ? 'Locação' : 'Venda');
  const papeis = (tipo) => (tipo === 'Locação' ? { comprador: 'Locatário', vendedor: 'Locador' } : { comprador: 'Comprador', vendedor: 'Vendedor' });
  function partes(c) {
    const proposta = HH.find('propostas', c.propostaId) || {};
    const imovel = HH.find('imoveis', c.imovelId || proposta.imovelId) || {};
    const corretor = usuario(imovel.corretorId) || HH.db.usuarios.find((u) => u.perfil === 'corretor') || null;
    return { proposta, imovel, comprador: usuario(proposta.clienteId), vendedor: usuario(imovel.proprietarioId), corretor };
  }
  const contratoAtivoDe = (propostaId) => HH.db.contratos.find((c) => c.propostaId === propostaId && c.status !== REC) || null;
  const prontas = () => HH.db.propostas.filter((p) => p.status === 'Aprovada' && HH.pagamentoDe(p.id) && !contratoAtivoDe(p.id));
  const progresso = (c) => { const a = c.assinaturas || []; return { ok: a.filter((x) => x.status === 'Assinado').length, total: a.length }; };
  const progTxt = (c) => { const p = progresso(c); return `${p.ok} de ${p.total}`; };
  const progBar = (c) => { const p = progresso(c); const pct = p.total ? Math.round((p.ok / p.total) * 100) : 0; return `<div class="ct-prog" title="${pct}%"><span style="width:${pct}%"></span></div>`; };
  const sortDesc = (arr, k) => arr.slice().sort((a, b) => String(b[k] || '').localeCompare(String(a[k] || '')));

  // Notifica comprador/locatário e proprietário do contrato.
  function notificarPartes(c, texto) {
    const { comprador, vendedor } = partes(c);
    const ids = [comprador && comprador.id, vendedor && vendedor.id].filter(Boolean);
    [...new Set(ids)].forEach((id) => HH.notify(id, texto, '#/meus-contratos'));
  }
  function registrar(c, texto) {
    c.historico = c.historico || [{ data: c.criadoEm, versao: 1, texto: 'Contrato gerado e enviado para assinatura.', usuarioId: null }];
    c.historico.push({ data: new Date().toISOString(), versao: c.versao, texto, usuarioId: (HH.me() || {}).id || null });
  }

  // ---------- Datas ----------
  const z2 = (n) => String(n).padStart(2, '0');
  const toInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`; };
  const fromInput = (v) => (v ? new Date(v + 'T12:00:00').toISOString() : null);
  const addMonths = (iso, n) => { const d = new Date(iso); d.setMonth(d.getMonth() + n); return d.toISOString(); };
  const monthsBetween = (a, b) => { const x = new Date(a); const y = new Date(b); return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()); };

  // ---------- Documento (minuta formatada) ----------
  const multiline = (t) => esc(t).replace(/\n/g, '<br>');
  function enderecoImovel(im) {
    const l = [im.logradouro, im.numero].filter(Boolean).join(', ') + (im.complemento ? ', ' + im.complemento : '');
    return `${l} – ${im.bairro || ''}, ${im.cidade || ''}/${im.uf || ''}, CEP ${im.cep || ''}`;
  }
  function clausulasPadrao(d, ctx) {
    const { proposta, imovel: im } = ctx;
    const pp = papeis(d.tipo);
    const pag = HH.pagamentoDe(proposta.id);
    const indice = d.indiceReajuste || 'IGP-M';
    const cidade = `${im.cidade || 'Curitiba'}/${im.uf || 'PR'}`;
    const objeto = `O presente contrato tem por objeto o imóvel ${esc((im.tipo || '').toLowerCase())} código ${esc(im.codigo)} ("${esc(im.titulo)}"), situado em ${esc(enderecoImovel(im))}, com área de ${esc(im.area)} m² e ${esc(im.quartos)} quarto(s).`;
    const cl = [];
    if (d.tipo === 'Locação') {
      const meses = d.inicio && d.termino ? monthsBetween(d.inicio, d.termino) : 30;
      cl.push(['DO OBJETO', objeto + ' O imóvel destina-se exclusivamente ao uso ' + (im.tipo === 'Comercial' ? 'não residencial' : 'residencial') + ' do LOCATÁRIO.']);
      cl.push(['DO PRAZO', `A locação vigorará pelo prazo de ${meses} ${meses === 1 ? 'mês' : 'meses'}, com início em ${HH.date(d.inicio)} e término em ${HH.date(d.termino)}, nos termos da Lei nº 8.245/1991.`]);
      cl.push(['DO ALUGUEL E DO VENCIMENTO', `O aluguel mensal é de <strong>${HH.money(d.valor)}</strong>, a ser pago pelo LOCATÁRIO até o dia ${esc(d.vencimento)} de cada mês, por intermédio da IMOBILIÁRIA.`]);
      cl.push(['DO REAJUSTE', `O aluguel será reajustado a cada 12 (doze) meses pela variação acumulada do índice ${esc(indice)} ou, na sua extinção, por índice oficial que o substitua.`]);
      cl.push([pag ? 'DA TAXA DE RESERVA' : 'DA GARANTIA', pag ? `A taxa de reserva de ${HH.money(pag.valor)}, paga via ${esc(pag.forma)} (transação ${esc(pag.transacaoId)}), corresponde ao primeiro aluguel e será compensada na primeira competência.` : 'A garantia locatícia será definida entre as partes.']);
      cl.push(['DOS ENCARGOS', 'Correm por conta do LOCATÁRIO o IPTU, a taxa condominial ordinária e as despesas de consumo de água, energia e gás durante a vigência da locação.']);
      cl.push(['DA RESCISÃO', 'A devolução antecipada do imóvel sujeita o LOCATÁRIO à multa de 3 (três) aluguéis, proporcional ao período restante, nos termos do art. 4º da Lei nº 8.245/1991.']);
      cl.push(['DA DEVOLUÇÃO DO IMÓVEL', 'Findo o prazo, o LOCATÁRIO restituirá o imóvel nas mesmas condições em que o recebeu, conforme laudo de vistoria.']);
    } else {
      cl.push(['DO OBJETO', objeto + ` O ${pp.vendedor.toUpperCase()} declara que o imóvel se encontra livre e desembaraçado de quaisquer ônus.`]);
      cl.push(['DO PREÇO E DA FORMA DE PAGAMENTO', `O preço certo e ajustado é de <strong>${HH.money(d.valor)}</strong>, a ser pago na modalidade "${esc(proposta.pagamento || 'À vista')}".` + (pag ? ` O sinal de ${HH.money(pag.valor)}, pago via ${esc(pag.forma)} (transação ${esc(pag.transacaoId)}), integra o preço.` : '')]);
      if (proposta.pagamento && proposta.pagamento !== 'À vista') cl.push(['DO VENCIMENTO E DA CORREÇÃO', `Eventuais parcelas vencerão no dia ${esc(d.vencimento)} de cada mês e serão corrigidas pela variação do índice ${esc(indice)}.`]);
      cl.push(['DA POSSE', `A posse do imóvel será transmitida ao COMPRADOR a partir de ${HH.date(d.inicio)}` + (d.termino ? `, devendo a escritura definitiva ser lavrada até ${HH.date(d.termino)}.` : ', após a quitação do preço.')]);
      cl.push(['DOS TRIBUTOS E DESPESAS', 'O IPTU e as taxas condominiais até a data da posse são de responsabilidade do VENDEDOR; o ITBI, a escritura e o registro correm por conta do COMPRADOR.']);
      cl.push(['DA RESCISÃO', 'O descumprimento de qualquer cláusula sujeita a parte infratora à multa de 10% (dez por cento) do valor do contrato, sem prejuízo de perdas e danos.']);
    }
    if (d.clausulas && d.clausulas.trim()) cl.push(['DAS CLÁUSULAS ESPECIAIS', multiline(d.clausulas.trim())]);
    cl.push(['DA INTERVENIÊNCIA DA IMOBILIÁRIA', 'A HabitaHub Negócios Imobiliários intervém no presente instrumento na qualidade de intermediadora, fazendo jus à comissão ajustada em instrumento próprio.']);
    cl.push(['DA ASSINATURA ELETRÔNICA E DO FORO', `As partes reconhecem a validade da assinatura eletrônica deste instrumento (MP nº 2.200-2/2001) e elegem o foro da Comarca de ${esc(cidade)} para dirimir quaisquer dúvidas.`]);
    return cl;
  }

  // d: contrato ou rascunho { numero, tipo, valor, inicio, termino, vencimento, indiceReajuste, clausulas, propostaId, imovelId, versao, aditivos, assinaturas }
  function docHtml(d) {
    const ctx = partes(d);
    const { imovel: im, comprador, vendedor, corretor } = ctx;
    const pp = papeis(d.tipo);
    const titulo = d.tipo === 'Locação'
      ? `CONTRATO DE LOCAÇÃO DE IMÓVEL ${im.tipo === 'Comercial' ? 'NÃO RESIDENCIAL' : 'RESIDENCIAL'}`
      : 'CONTRATO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL';
    const qual = (u, papel) => (u
      ? `<p class="ct-parte"><strong>${esc(papel.toUpperCase())}:</strong> ${esc(u.nome)}, inscrito(a) no CPF sob o nº ${esc(HH.formatCPF(u.cpf))}, residente em ${esc(u.endereco || '—')}, e-mail ${esc(u.email)}.</p>`
      : `<p class="ct-parte"><strong>${esc(papel.toUpperCase())}:</strong> não identificado.</p>`);
    const cls = clausulasPadrao(d, ctx);
    const sig = (d.assinaturas && d.assinaturas.length) ? d.assinaturas : [
      { nome: vendedor && vendedor.nome, papel: pp.vendedor }, { nome: comprador && comprador.nome, papel: pp.comprador }, { nome: corretor && corretor.nome, papel: 'Imobiliária' }];
    const aditivos = d.aditivos || [];
    return `<article class="ct-doc">
      <div class="ct-doc-meta"><span>${d.numero ? 'Nº ' + esc(d.numero) : 'MINUTA – número gerado na emissão'}</span><span>Versão ${esc(d.versao || 1)}</span></div>
      <h2 class="ct-doc-title">${esc(titulo)}</h2>
      <p class="ct-doc-intro">Pelo presente instrumento particular, as partes abaixo qualificadas têm entre si, justo e contratado, o que segue:</p>
      ${qual(vendedor, pp.vendedor)}
      ${qual(comprador, pp.comprador)}
      <p class="ct-parte"><strong>INTERVENIENTE IMOBILIÁRIA:</strong> HabitaHub Negócios Imobiliários, neste ato representada por ${esc(corretor ? corretor.nome : '—')}${corretor && corretor.creci ? `, CRECI ${esc(corretor.creci)}/${esc(corretor.creciUf || '')}` : ''}.</p>
      <ol class="ct-clausulas">
        ${cls.map(([t, txt], i) => `<li><h4>CLÁUSULA ${i + 1}ª – ${esc(t)}</h4><p>${txt}</p></li>`).join('')}
      </ol>
      <p class="ct-doc-local">${esc(im.cidade || 'Curitiba')}/${esc(im.uf || 'PR')}, ${HH.date(d.inicio || new Date().toISOString())}.</p>
      <div class="ct-assin">${sig.map((s) => `<div class="ct-assin-item"><div class="ct-assin-line">${s.status === 'Assinado' ? `<span class="ct-assin-ok">Assinado digitalmente em ${HH.dateTime(s.data)}</span>` : ''}</div><strong>${esc(s.nome || '—')}</strong><span>${esc(s.papel)}</span></div>`).join('')}</div>
      ${aditivos.map((a, i) => `<section class="ct-aditivo"><h3>TERMO ADITIVO Nº ${i + 1}</h3><p class="small">Registrado em ${HH.dateTime(a.data)} · Motivo: ${esc(a.motivo)}</p><p>${multiline(a.texto)}</p><p class="small">As demais cláusulas do contrato original permanecem inalteradas.</p></section>`).join('')}
    </article>`;
  }

  // Modal "Documento assinado (PDF)" com o manifesto de assinaturas (a URL é fictícia).
  function abrirPdf(c) {
    const assin = c.assinaturas || [];
    HH.modal({
      title: 'Documento assinado (PDF)', wide: true,
      body: `<div class="alert info">Visualização simulada. O arquivo assinado está vinculado ao contrato em <code class="ct-code">${esc(c.pdfUrl)}</code>.</div>
        <div class="ct-manifesto">
          <h3>Manifesto de assinaturas digitais</h3>
          <p class="small muted">Contrato ${esc(c.numero)} · versão ${esc(c.versao)} · envelope ${esc(c.envelopeId)} · hash do documento ${esc(HH.hash(JSON.stringify([c.numero, c.versao, c.clausulas, c.aditivos, assin])))}</p>
          <table class="table"><thead><tr><th>Signatário</th><th>Papel</th><th>E-mail</th><th>Status</th><th>Data/hora</th></tr></thead><tbody>
            ${assin.map((a) => `<tr><td>${esc(a.nome)}</td><td>${esc(a.papel)}</td><td>${esc(a.email)}</td><td>${HH.badge(a.status)}</td><td>${HH.dateTime(a.data)}</td></tr>`).join('')}
          </tbody></table>
        </div>
        ${docHtml(c)}`,
    });
  }
  function abrirDocumento(c) {
    HH.modal({ title: `Contrato ${c.numero}`, wide: true, body: docHtml(c) });
  }

  // ---------- Validação dos campos da minuta ----------
  function validaCampos(f, tipo) {
    const inv = []; const msgs = [];
    if (!f.inicio) { inv.push('inicio'); msgs.push('Informe a data de início da vigência.'); }
    const v = Number(f.vencimento);
    if (!Number.isInteger(v) || v < 1 || v > 31) { inv.push('vencimento'); msgs.push('O dia de vencimento deve estar entre 1 e 31.'); }
    if (tipo === 'Locação' && !f.termino) { inv.push('termino'); msgs.push('Informe a data de término da locação.'); }
    if (f.termino && f.inicio && f.termino <= f.inicio) { inv.push('termino'); msgs.push('A data de término deve ser posterior à data de início.'); }
    if ('valor' in f && !(Number(f.valor) > 0)) { inv.push('valor'); msgs.push('Informe um valor válido para o contrato.'); }
    return { inv, msg: msgs[0] || '' };
  }
  const camposDe = (f) => ({
    inicio: fromInput(f.inicio), termino: f.termino ? fromInput(f.termino) : null,
    vencimento: Number(f.vencimento), indiceReajuste: f.indiceReajuste, clausulas: f.clausulas || '',
  });
  function camposForm(f, tipo, { comValor = false } = {}) {
    const loc = tipo === 'Locação';
    return `
      ${comValor ? `<div class="field"><label>Valor ${loc ? 'do aluguel mensal' : 'da venda'} (R$)</label><input class="input" type="number" min="1" step="0.01" name="valor" value="${esc(f.valor)}"></div>` : ''}
      <div class="grid grid-2">
        <div class="field"><label>Início da vigência *</label><input class="input" type="date" name="inicio" value="${esc(f.inicio)}"></div>
        <div class="field"><label>Término ${loc ? '*' : '(opcional)'}</label><input class="input" type="date" name="termino" value="${esc(f.termino)}"><span class="hint">${loc ? 'Locação: 30 meses a partir do início, por padrão.' : 'Venda: prazo para a escritura definitiva.'}</span></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label>Dia de vencimento *</label><input class="input" type="number" min="1" max="31" name="vencimento" value="${esc(f.vencimento)}"></div>
        <div class="field"><label>Índice de reajuste</label><select class="input" name="indiceReajuste">${['IGP-M', 'IPCA'].map((i) => `<option ${f.indiceReajuste === i ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Cláusulas adicionais (opcional)</label><textarea class="input" name="clausulas" rows="4" placeholder="Ex.: O locador autoriza a instalação de ar-condicionado.">${esc(f.clausulas)}</textarea><span class="hint">Cláusulas acordadas entre as partes, incluídas como "Cláusulas especiais" (A1).</span></div>`;
  }

  // ======================================================================
  // #/contratos – lista da equipe
  // ======================================================================
  let filtro = 'Todos';
  HH.route('#/contratos', {
    title: 'Contratos', roles: STAFF,
    render: () => {
      const ps = prontas();
      const todos = sortDesc(HH.db.contratos, 'criadoEm');
      const cs = filtro === 'Todos' ? todos : todos.filter((c) => c.status === filtro);
      const nome = (id) => (usuario(id) || {}).nome || '—';
      return `
        <div class="page-head"><div><h1>Contratos ${HH.ucTag(['UC09', 'UC10', 'UC12'])}</h1><p class="sub">Geração, alteração e acompanhamento das assinaturas digitais.</p></div></div>
        <div class="card">
          <div class="card-title"><h3>Prontas para contrato</h3><span class="small muted">Propostas aprovadas com a taxa de reserva paga</span></div>
          ${ps.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Imóvel</th><th>Proponente</th><th>Tipo</th><th>Valor final</th><th>Taxa paga</th><th></th></tr></thead><tbody>
            ${ps.map((p) => { const im = HH.find('imoveis', p.imovelId) || {}; const pg = HH.pagamentoDe(p.id); return `<tr>
              <td><div class="row">${HH.thumb(im, 'sm')}<div><strong>${esc(im.codigo)}</strong><br><span class="small muted">${esc(im.titulo)}</span></div></div></td>
              <td>${esc(nome(p.clienteId))}</td><td>${esc(tipoDe(im))}</td><td>${HH.money(HH.valorFinal(p))}</td>
              <td>${HH.money(pg.valor)} <span class="small muted">(${esc(pg.forma)})</span></td>
              <td class="row end"><a class="btn btn-primary btn-sm" href="#/contratos/novo/${encodeURIComponent(p.id)}" data-ct-gerar="${esc(p.id)}">Gerar Contrato</a></td></tr>`; }).join('')}
          </tbody></table></div>` : '<div class="empty">Nenhuma proposta aprovada e paga aguardando contrato.</div>'}
        </div>
        <div class="card">
          <div class="card-title"><h3>Contratos</h3></div>
          <div class="tabs">${['Todos', AG, VIG, REC].map((s) => `<button data-ct-filtro="${esc(s)}" class="${filtro === s ? 'active' : ''}">${esc(s)} (${s === 'Todos' ? todos.length : todos.filter((c) => c.status === s).length})</button>`).join('')}</div>
          ${cs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Número</th><th>Imóvel</th><th>Partes</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Assinaturas</th><th>Versão</th><th></th></tr></thead><tbody>
            ${cs.map((c) => { const pt = partes(c); const pp = papeis(c.tipo); return `<tr>
              <td><a href="#/contratos/${encodeURIComponent(c.id)}"><strong>${esc(c.numero)}</strong></a></td>
              <td>${esc(pt.imovel.codigo)}<br><span class="small muted">${esc(pt.imovel.titulo)}</span></td>
              <td class="small">${esc(pp.comprador)}: ${esc(pt.comprador ? pt.comprador.nome : '—')}<br>${esc(pp.vendedor)}: ${esc(pt.vendedor ? pt.vendedor.nome : '—')}</td>
              <td>${esc(c.tipo)}</td><td>${HH.money(c.valor)}${c.tipo === 'Locação' ? '<span class="small muted">/mês</span>' : ''}</td>
              <td>${HH.badge(c.status)}${c.serasa && c.serasa.pendente ? '<br><span class="badge warn ct-mt">Crédito pendente</span>' : ''}</td>
              <td><span class="ct-prog-txt">${progTxt(c)}</span>${progBar(c)}</td>
              <td>v${esc(c.versao)}${(c.aditivos || []).length ? `<br><span class="small muted">${c.aditivos.length} aditivo(s)</span>` : ''}</td>
              <td><a class="btn btn-sm" href="#/contratos/${encodeURIComponent(c.id)}">Abrir</a></td></tr>`; }).join('')}
          </tbody></table></div>` : '<div class="empty">Nenhum contrato neste filtro.</div>'}
        </div>`;
    },
    mount: (root) => {
      root.querySelectorAll('[data-ct-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.ctFiltro; HH.render(); }));
      // "Gerar Contrato" sempre inicia um assistente novo para a proposta.
      root.querySelectorAll('[data-ct-gerar]').forEach((a) => a.addEventListener('click', () => { delete wizards[a.dataset.ctGerar]; }));
    },
  });
  HH.nav({ label: 'Contratos', href: '#/contratos', roles: STAFF, group: 'Imobiliária', order: 40 });

  // ======================================================================
  // #/contratos/novo/:propostaId – UC09 Gerar Contrato (assistente)
  // ======================================================================
  const wizards = {};
  function validaProposta(p) {
    if (!p) return MSG.propostaInvalida + ' A proposta não foi encontrada.';
    if (p.status !== 'Aprovada') return MSG.propostaInvalida + ` A proposta está "${p.status}" e precisa estar aprovada.`;
    if (!HH.pagamentoDe(p.id)) return MSG.propostaInvalida + ' A taxa de reserva ainda não foi paga.';
    const c = contratoAtivoDe(p.id);
    if (c) return MSG.propostaInvalida + ` Já existe o contrato ${c.numero} para esta proposta.`;
    return '';
  }
  function wizOf(p) {
    if (!wizards[p.id]) {
      const im = HH.find('imoveis', p.imovelId) || {};
      const loc = tipoDe(im) === 'Locação';
      const hoje = new Date().toISOString();
      wizards[p.id] = {
        step: 1, estado: 'idle', resultado: null, serasa: null, erro: '', perguntando: false, terminoAuto: true,
        form: { inicio: toInput(hoje), termino: loc ? toInput(addMonths(hoje, 30)) : '', vencimento: '10', indiceReajuste: loc ? 'IGP-M' : 'IPCA', clausulas: '' },
      };
    }
    return wizards[p.id];
  }
  function rascunhoDe(p, w) {
    const im = HH.find('imoveis', p.imovelId) || {};
    return { numero: null, propostaId: p.id, imovelId: im.id, tipo: tipoDe(im), valor: HH.valorFinal(p), versao: 1, aditivos: [], ...camposDe(w.form) };
  }
  function signatariosDe(d) {
    const { comprador, vendedor, corretor } = partes(d);
    const pp = papeis(d.tipo);
    return [
      { nome: comprador ? comprador.nome : '—', email: comprador ? comprador.email : '', papel: pp.comprador },
      { nome: vendedor ? vendedor.nome : '—', email: vendedor ? vendedor.email : '', papel: pp.vendedor },
      { nome: corretor ? corretor.nome : 'HabitaHub', email: corretor ? corretor.email : '', papel: 'Imobiliária' },
    ];
  }
  const noAssistente = (pid) => { const m = HH.match(location.hash); return !!m && m.route.pattern === '#/contratos/novo/:propostaId' && m.params.propostaId === pid; };

  async function consultarSerasa(p) {
    const w = wizOf(p);
    const cli = usuario(p.clienteId) || {};
    w.estado = 'consultando'; w.erro = '';
    try {
      const r = await HH.api.serasa(cli.cpf);
      w.resultado = r;
      if (r.restricao) w.estado = 'restricao';
      else { w.estado = 'ok'; w.serasa = { score: r.score, situacao: r.situacao, restricao: false, pendente: false }; }
    } catch (e) {
      w.estado = 'fora'; w.erro = e.message;
    }
    if (noAssistente(p.id)) HH.render();
  }
  async function perguntarRestricao(p) {
    const w = wizOf(p);
    if (w.perguntando) return;
    w.perguntando = true;
    const ok = await HH.confirm(MSG.restricao, { title: 'Restrição crítica no Serasa', ok: 'Prosseguir', danger: true });
    w.perguntando = false;
    if (!ok) {
      delete wizards[p.id];
      HH.toast('Geração do contrato cancelada pelo corretor.', 'warn');
      HH.go('#/contratos');
      return;
    }
    const r = w.resultado;
    w.estado = 'ok';
    w.serasa = { score: r.score, situacao: r.situacao, restricao: true, pendente: false };
    if (noAssistente(p.id)) HH.render();
  }

  function stepper(step) {
    const nomes = ['Análise de crédito', 'Minuta', 'Finalizar e Emitir'];
    return `<ol class="ct-steps">${nomes.map((n, i) => `<li class="${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}"><span>${i + 1 < step ? '✓' : i + 1}</span>${esc(n)}</li>`).join('')}</ol>`;
  }
  function serasaCard(s) {
    if (!s) return '';
    if (s.pendente) return `<div class="alert warn"><strong>${esc(MSG.pendente)}.</strong> O serviço Serasa está indisponível. O contrato será gerado em contingência, com a análise de crédito pendente.</div>`;
    return `<div class="ct-serasa ${s.restricao ? 'danger' : 'ok'}">
      <div><span class="label">Score de crédito</span><strong>${esc(s.score)}</strong></div>
      <div><span class="label">Situação do CPF</span><strong>${esc(s.situacao)}</strong></div>
      <div><span class="label">Restrição financeira</span><strong>${s.restricao ? 'Sim' : 'Não'}</strong></div>
    </div>`;
  }

  function step1(p, w, cli) {
    let body;
    if (w.estado === 'idle' || w.estado === 'consultando') {
      body = `<div class="ct-loading"><span class="spinner"></span> Consultando a API Serasa com o CPF ${esc(HH.formatCPF(cli.cpf))}…</div>`;
    } else if (w.estado === 'restricao') {
      body = `${serasaCard({ ...w.resultado, pendente: false })}<div class="alert danger">${esc(MSG.restricao)}</div>
        <div class="row end"><button class="btn" data-ct-cancelar>Cancelar</button><button class="btn btn-danger" data-ct-reperguntar>Prosseguir mesmo assim</button></div>`;
    } else if (w.estado === 'fora') {
      body = `<div class="alert danger">${esc(w.erro)}</div>
        <div class="alert warn"><strong>${esc(MSG.pendente)}.</strong> É possível prosseguir com a geração contingencial: o contrato ficará marcado com a análise de crédito pendente.</div>
        <div class="row end"><button class="btn" data-ct-retentar>Tentar novamente</button><button class="btn btn-primary" data-ct-contingencia>Gerar em contingência</button></div>`;
    } else {
      body = `${w.serasa.pendente ? '' : `<div class="alert ${w.serasa.restricao ? 'danger' : 'ok'}">${w.serasa.restricao ? 'Restrição financeira grave registrada. O corretor optou por prosseguir.' : 'Parecer positivo: proponente sem restrições financeiras.'}</div>`}
        ${serasaCard(w.serasa)}
        <div class="row end"><button class="btn" data-ct-retentar>Consultar novamente</button><button class="btn btn-primary" data-ct-ir="2">Continuar para a minuta</button></div>`;
    }
    return `<div class="card"><div class="card-title"><h3>1. Análise de crédito (Serasa)</h3></div>
      <p class="muted">Proponente: <strong>${esc(cli.nome)}</strong> · CPF ${esc(HH.formatCPF(cli.cpf))}</p>${body}</div>`;
  }
  function step2(p, w, d) {
    return `<div class="ct-wizard">
      <div class="card"><div class="card-title"><h3>2. Dados da minuta</h3></div>
        <div class="ct-kv">
          <div><span>Tipo</span><strong>${esc(d.tipo)}</strong></div>
          <div><span>Valor ${d.tipo === 'Locação' ? 'mensal' : 'da venda'}</span><strong>${HH.money(d.valor)}</strong></div>
        </div>
        ${serasaCard(w.serasa)}
        <form class="form" data-ct-form>${camposForm(w.form, d.tipo)}</form>
        <div class="row end"><button class="btn" data-ct-ir="1">Voltar</button><button class="btn btn-primary" data-ct-ir="3">Revisar e continuar</button></div>
      </div>
      <div><div class="ct-preview-head small muted">Pré-visualização do documento</div><div data-ct-preview>${docHtml(d)}</div></div>
    </div>`;
  }
  function step3(p, w, d) {
    const checks = [
      ['Proposta aprovada', p.status === 'Aprovada'],
      ['Taxa de reserva paga', !!HH.pagamentoDe(p.id)],
      [w.serasa && w.serasa.pendente ? 'Análise de crédito contingencial (pendente)' : 'Análise de crédito realizada', !!w.serasa],
    ];
    const sign = signatariosDe(d);
    return `<div class="ct-wizard">
      <div class="card"><div class="card-title"><h3>3. Finalizar e Emitir</h3></div>
        <p class="small muted">${esc(MSG.rn1Emissao)}</p>
        <ul class="ct-checks">${checks.map(([t, ok]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(t)}</li>`).join('')}</ul>
        ${w.serasa && w.serasa.pendente ? `<div class="alert warn">${esc(MSG.pendente)}</div>` : ''}
        <h4>Signatários do envelope</h4>
        <ul class="ct-sign-list">${sign.map((s) => `<li><strong>${esc(s.nome)}</strong> <span class="badge">${esc(s.papel)}</span><br><span class="small muted">${esc(s.email)}</span></li>`).join('')}</ul>
        <p class="small muted">Ao emitir, o número do contrato é gerado, o documento é enviado ao provedor de assinatura digital e o contrato fica "${esc(AG)}".</p>
        <div class="row end"><button class="btn" data-ct-ir="2">Voltar</button><button class="btn btn-primary" data-ct-emitir>Finalizar e Emitir</button></div>
      </div>
      <div><div class="ct-preview-head small muted">Documento final</div>${docHtml(d)}</div>
    </div>`;
  }

  async function emitir(p, w, btn) {
    const d = rascunhoDe(p, w);
    const err = validaProposta(p);
    const rn1 = p && p.status === 'Aprovada' && HH.pagamentoDe(p.id) && w.serasa && (w.serasa.pendente || w.serasa.score != null);
    if (err || !rn1) { HH.toast(err || MSG.rn1Emissao, 'danger'); return; }
    const v = validaCampos(w.form, d.tipo);
    if (v.inv.length) { w.step = 2; HH.render(); HH.toast(v.msg, 'danger'); return; }
    const sign = signatariosDe(d);
    let env;
    try { env = await HH.busy(btn, HH.api.enviarEnvelope(sign)); } catch (e) { HH.toast(e.message, 'danger'); return; }
    const agora = new Date().toISOString();
    const me = HH.me();
    const c = {
      id: HH.uid('c'), numero: HH.nextCodigo('contrato'), propostaId: p.id, imovelId: d.imovelId, tipo: d.tipo,
      inicio: d.inicio, termino: d.termino, valor: d.valor, vencimento: d.vencimento, indiceReajuste: d.indiceReajuste, clausulas: d.clausulas,
      status: AG, serasa: { ...w.serasa }, envelopeId: env.envelopeId,
      assinaturas: sign.map((s) => ({ ...s, status: 'Pendente', data: null })),
      aditivos: [], versao: 1, pdfUrl: null, criadoEm: agora,
      historico: [{ data: agora, versao: 1, texto: `Contrato gerado e enviado para assinatura (envelope ${env.envelopeId}).` + (w.serasa.pendente ? ' Emissão contingencial: análise de crédito pendente.' : w.serasa.restricao ? ' Emitido com restrição de crédito, por decisão do corretor.' : ''), usuarioId: me && me.id }],
    };
    HH.insert('contratos', c);
    const im = HH.find('imoveis', c.imovelId) || {};
    notificarPartes(c, `Contrato ${c.numero} de "${im.titulo}" gerado. Assine pelo link enviado pelo provedor de assinatura digital.`);
    delete wizards[p.id];
    HH.toast(`Contrato ${c.numero} emitido. Status: ${AG}.`, 'ok');
    HH.go('#/contratos/' + encodeURIComponent(c.id));
  }

  HH.route('#/contratos/novo/:propostaId', {
    title: 'Gerar contrato', roles: STAFF,
    render: ({ params }) => {
      const p = HH.find('propostas', params.propostaId);
      const head = (sub) => `<div class="page-head"><div><h1>Gerar Contrato ${HH.ucTag('UC09')}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="btn" data-ct-cancelar>Cancelar</button></div>`;
      const err = validaProposta(p);
      if (err) return head('') + `<div class="alert danger">${esc(err)}</div><p class="muted">${esc(MSG.rn1Emissao)}</p><a class="btn" href="#/contratos">Voltar para contratos</a>`;
      const w = wizOf(p);
      const im = HH.find('imoveis', p.imovelId) || {};
      const cli = usuario(p.clienteId) || {};
      const d = rascunhoDe(p, w);
      const sub = `Proposta de ${esc(cli.nome)} para ${esc(im.codigo)} · ${esc(im.titulo)} — ${HH.money(HH.valorFinal(p))}`;
      const body = w.step === 1 || !w.serasa ? step1(p, w, cli) : w.step === 2 ? step2(p, w, d) : step3(p, w, d);
      return head(sub) + stepper(w.serasa ? w.step : 1) + body;
    },
    mount: (root, { params }) => {
      const p = HH.find('propostas', params.propostaId);
      root.querySelectorAll('[data-ct-cancelar]').forEach((b) => b.addEventListener('click', () => { if (p) delete wizards[p.id]; HH.go('#/contratos'); }));
      if (validaProposta(p)) return;
      const w = wizOf(p);
      if (w.estado === 'idle') consultarSerasa(p);
      if (w.estado === 'restricao') perguntarRestricao(p);

      const q = (s) => root.querySelector(s);
      const form = q('[data-ct-form]');
      if (form) {
        const tipo = rascunhoDe(p, w).tipo;
        form.addEventListener('input', (e) => {
          if (e.target.name === 'termino') w.terminoAuto = false;
          if (e.target.name === 'inicio' && tipo === 'Locação' && w.terminoAuto && e.target.value) {
            form.elements.termino.value = toInput(addMonths(fromInput(e.target.value), 30));
          }
          w.form = HH.formData(form);
          const prev = q('[data-ct-preview]');
          if (prev) prev.innerHTML = docHtml(rascunhoDe(p, w));
        });
      }
      root.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.hasAttribute('data-ct-retentar')) { w.estado = 'idle'; w.serasa = null; w.resultado = null; HH.render(); }
        else if (t.hasAttribute('data-ct-reperguntar')) perguntarRestricao(p);
        else if (t.hasAttribute('data-ct-contingencia')) {
          w.serasa = { score: null, situacao: 'Não consultada', restricao: false, pendente: true };
          w.estado = 'ok'; w.step = 2;
          HH.toast(MSG.pendente + ': geração contingencial.', 'warn');
          HH.render();
        } else if (t.dataset.ctIr) {
          const alvo = Number(t.dataset.ctIr);
          if (alvo === 3 && form) {
            w.form = HH.formData(form);
            const v = validaCampos(w.form, rascunhoDe(p, w).tipo);
            HH.markInvalid(form, v.inv);
            if (v.inv.length) { HH.toast(v.msg, 'danger'); return; }
          }
          w.step = alvo; HH.render();
        } else if (t.hasAttribute('data-ct-emitir')) emitir(p, w, t);
      });
    },
  });

  // ======================================================================
  // #/contratos/:id – detalhe (UC10 e UC12)
  // ======================================================================
  const syncMsg = {};

  function historicoDe(c) {
    return c.historico && c.historico.length ? c.historico : [{ data: c.criadoEm, versao: 1, texto: 'Contrato gerado e enviado para assinatura' + (c.envelopeId ? ` (envelope ${c.envelopeId}).` : '.'), usuarioId: null }];
  }
  function assinaturasCard(c, { comSync = false } = {}) {
    const p = progresso(c);
    return `<div class="card"><div class="card-title"><h3>Assinaturas ${comSync ? HH.ucTag('UC12') : ''}</h3><span class="small muted">${p.ok} de ${p.total} assinaturas colhidas</span></div>
      ${progBar(c)}
      <ul class="ct-sign-list">${(c.assinaturas || []).map((a) => `<li><div class="row between"><strong>${esc(a.nome)}</strong>${HH.badge(a.status)}</div>
        <span class="small muted">${esc(a.papel)} · ${esc(a.email)}${a.data ? ' · ' + HH.dateTime(a.data) : ''}</span></li>`).join('')}</ul>
      ${c.pdfUrl ? '<button class="btn btn-sm" data-ct-pdf>📄 Documento assinado (PDF)</button>' : ''}
    </div>`;
  }
  function aditivosHtml(c) {
    const ads = c.aditivos || [];
    if (!ads.length) return '<p class="small muted">Nenhum termo aditivo registrado.</p>';
    return `<ul class="ct-aditivos">${ads.map((a, i) => `<li><strong>Termo aditivo nº ${i + 1}</strong> <span class="small muted">· ${HH.dateTime(a.data)}${a.usuarioId ? ' · ' + esc((usuario(a.usuarioId) || {}).nome || '') : ''}</span>
      <div class="small"><strong>Motivo:</strong> ${esc(a.motivo)}</div><div class="small">${multiline(a.texto)}</div></li>`).join('')}</ul>`;
  }

  HH.route('#/contratos/:id', {
    title: 'Contrato', roles: STAFF,
    render: ({ params }) => {
      const c = HH.find('contratos', params.id);
      if (!c) return `<div class="page-head"><h1>Contrato ${HH.ucTag('UC10')}</h1></div><div class="alert danger">${esc(MSG.naoEncontrado)}</div><a class="btn" href="#/contratos">Voltar para contratos</a>`;
      const pt = partes(c);
      const pp = papeis(c.tipo);
      const msg = syncMsg[c.id];
      const s = c.serasa || {};
      const kv = [
        ['Proposta', esc(c.propostaId)], ['Imóvel', `<a href="#/imovel/${encodeURIComponent(pt.imovel.id || '')}">${esc(pt.imovel.codigo)}</a> · ${esc(pt.imovel.titulo)}`],
        [pp.comprador, esc(pt.comprador ? pt.comprador.nome : '—')], [pp.vendedor, esc(pt.vendedor ? pt.vendedor.nome : '—')],
        ['Tipo', esc(c.tipo)], ['Valor', HH.money(c.valor) + (c.tipo === 'Locação' ? '/mês' : '')],
        ['Início', HH.date(c.inicio)], ['Término', HH.date(c.termino)], ['Vencimento', 'Dia ' + esc(c.vencimento)],
        ['Reajuste', esc(c.indiceReajuste)], ['Versão', 'v' + esc(c.versao)], ['Envelope', esc(c.envelopeId || '—')],
        ['Serasa', s.pendente ? `<span class="badge warn">${esc(MSG.pendente)}</span>` : `Score ${esc(s.score)} · ${esc(s.situacao)}${s.restricao ? ' <span class="badge danger">Restrição</span>' : ''}`],
      ];
      return `
        <div class="page-head">
          <div><h1>Contrato ${esc(c.numero)} ${HH.badge(c.status)} ${HH.ucTag(['UC10', 'UC12'])}</h1><p class="sub"><a href="#/contratos">← Contratos</a> · Criado em ${HH.dateTime(c.criadoEm)}</p></div>
          <div class="row">
            <button class="btn" data-ct-editar ${c.status === REC ? 'disabled title="Contrato recusado não pode ser editado."' : ''}>Aditivar / Editar</button>
            ${c.status === AG ? '<button class="btn btn-primary" data-ct-sync>Sincronizar Assinaturas</button>' : ''}
          </div>
        </div>
        ${msg ? `<div class="alert ${msg.type}">${esc(msg.text)}</div>` : ''}
        ${c.status === REC ? `<div class="alert danger">Um signatário recusou a assinatura na plataforma externa. O contrato não pode mais ser editado; gere um novo contrato a partir da proposta em "Prontas para contrato".</div>` : ''}
        ${c.status === VIG ? `<div class="alert ok">Contrato vigente: todas as partes assinaram digitalmente.</div>` : ''}
        ${c.status === AG ? `<div class="alert info">${esc(progTxt(c))} assinaturas colhidas. ${esc(MSG.rn1Vigencia)}</div>` : ''}
        ${s.pendente ? `<div class="alert warn"><strong>${esc(MSG.pendente)}.</strong> Contrato emitido em contingência (Serasa indisponível na geração).</div>` : ''}
        <div class="ct-detail">
          <div>${docHtml(c)}</div>
          <div>
            <div class="card"><div class="card-title"><h3>Dados do contrato</h3></div>
              <dl class="ct-dl">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
            </div>
            ${assinaturasCard(c, { comSync: true })}
            <div class="card"><div class="card-title"><h3>Versões e aditivos</h3></div>
              <ul class="timeline">${sortDesc(historicoDe(c), 'data').map((h) => `<li><div><strong>v${esc(h.versao)}</strong> · ${esc(h.texto)}</div><div class="when">${HH.dateTime(h.data)}${h.usuarioId ? ' · ' + esc((usuario(h.usuarioId) || {}).nome || '') : ''}</div></li>`).join('')}</ul>
              <h4>Termos aditivos</h4>${aditivosHtml(c)}
            </div>
          </div>
        </div>`;
    },
    mount: (root, { params }) => {
      const c = HH.find('contratos', params.id);
      if (!c) return;
      const q = (s) => root.querySelector(s);
      const sync = q('[data-ct-sync]');
      if (sync) sync.addEventListener('click', () => sincronizar(c, sync));
      const pdf = q('[data-ct-pdf]');
      if (pdf) pdf.addEventListener('click', () => abrirPdf(c));
      const ed = q('[data-ct-editar]');
      if (ed) ed.addEventListener('click', () => {
        if (c.status === REC) { HH.toast('Contrato recusado pelo assinante não pode ser editado.', 'danger'); return; }
        if (c.status === AG) editarMinuta(c); else registrarAditivo(c);
      });
    },
  });

  // ---- UC12 Importar Assinaturas ----
  async function sincronizar(c, btn) {
    let r;
    try { r = await HH.busy(btn, HH.api.statusEnvelope(c.envelopeId, c.assinaturas)); }
    catch (e) { syncMsg[c.id] = { type: 'danger', text: e.message }; HH.toast(e.message, 'danger'); HH.render(); return; } // E1
    c.assinaturas = r.assinaturas;
    const { ok, total } = progresso(c);
    const im = HH.find('imoveis', c.imovelId) || {};
    if (r.recusado) { // E2
      const quem = r.assinaturas.find((a) => a.status === 'Recusado') || {};
      c.status = REC;
      registrar(c, `Assinatura recusada por ${quem.nome} (${quem.papel}). Status alterado para "${REC}".`);
      notificarPartes(c, `O contrato ${c.numero} de "${im.titulo}" foi recusado por um signatário.`);
      HH.notifyStaff(`Contrato ${c.numero} recusado por ${quem.nome}.`, '#/contratos/' + c.id);
      syncMsg[c.id] = { type: 'danger', text: `Documento recusado por ${quem.nome} (${quem.papel}) na plataforma de assinatura. Status alterado para "${REC}".` };
    } else if (total && ok === total) { // Principal + RN1
      c.status = VIG;
      c.pdfUrl = r.pdfUrl || `https://assinatura.demo/${c.envelopeId}/documento-assinado.pdf`;
      if (im.id) HH.update('imoveis', im.id, { status: 'Indisponível' });
      registrar(c, 'Todas as partes assinaram. PDF assinado com manifesto vinculado; contrato vigente.');
      notificarPartes(c, `Contrato ${c.numero} de "${im.titulo}" assinado por todas as partes e agora está vigente.`);
      syncMsg[c.id] = { type: 'ok', text: `${ok} de ${total} assinaturas colhidas. Contrato "${VIG}", documento assinado vinculado e imóvel ${im.codigo || ''} marcado como Indisponível.` };
    } else { // A1
      registrar(c, `Sincronização: ${ok} de ${total} assinaturas colhidas.`);
      syncMsg[c.id] = { type: 'warn', text: `${ok} de ${total} assinaturas colhidas. O contrato permanece "${AG}".` };
    }
    HH.save();
    HH.toast(syncMsg[c.id].text, syncMsg[c.id].type);
    HH.render();
  }

  // ---- UC10 A1: edição direta da minuta não assinada ----
  function editarMinuta(c) {
    const f = { valor: c.valor, inicio: toInput(c.inicio), termino: toInput(c.termino), vencimento: c.vencimento, indiceReajuste: c.indiceReajuste, clausulas: c.clausulas || '' };
    const assinadas = progresso(c).ok;
    HH.modal({
      title: `Editar minuta – ${c.numero}`, wide: true,
      body: `<div class="alert info">Contrato "${esc(AG)}": alteração direta dos campos, sem termo aditivo (UC10 A1). A versão do documento será incrementada e um novo envelope será enviado às partes${assinadas ? `; as ${assinadas} assinatura(s) já colhida(s) serão descartadas` : ''}.</div>
        <form class="form" data-ct-edit-form>${camposForm(f, c.tipo, { comValor: true })}</form>`,
      actions: [
        { label: 'Cancelar' },
        { label: 'Salvar', class: 'btn-primary', onClick: async (close, root) => {
          const form = root.querySelector('[data-ct-edit-form]');
          const d = HH.formData(form);
          const v = validaCampos(d, c.tipo);
          HH.markInvalid(form, v.inv);
          if (v.inv.length) { HH.toast(v.msg, 'danger'); return false; }
          const novo = { valor: Number(d.valor), ...camposDe(d) };
          const rotulos = { valor: 'valor', inicio: 'início', termino: 'término', vencimento: 'vencimento', indiceReajuste: 'índice de reajuste', clausulas: 'cláusulas adicionais' };
          const mudou = Object.keys(novo).filter((k) => (k === 'inicio' || k === 'termino' ? toInput(novo[k]) !== toInput(c[k]) : String(novo[k] ?? '') !== String(c[k] ?? '')));
          if (!mudou.length) { HH.toast('Nenhuma alteração realizada.', 'warn'); return false; }
          const sign = c.assinaturas.map(({ nome, email, papel }) => ({ nome, email, papel }));
          let env;
          try { env = await HH.busy(root.querySelector('[data-action="1"]'), HH.api.enviarEnvelope(sign)); }
          catch (e) { HH.toast(e.message, 'danger'); return false; }
          const descartadas = c.assinaturas.filter((a) => a.status === 'Assinado').map((a) => `${a.nome} (${a.papel})`);
          const envAnterior = c.envelopeId;
          Object.assign(c, novo);
          c.versao = (c.versao || 1) + 1;
          c.envelopeId = env.envelopeId;
          c.assinaturas = sign.map((s) => ({ ...s, status: 'Pendente', data: null }));
          registrar(c, `Minuta editada diretamente (A1): ${mudou.map((k) => rotulos[k]).join(', ')}. Novo envelope ${env.envelopeId} enviado.`
            + (descartadas.length ? ` Assinaturas da versão ${c.versao - 1} descartadas (envelope ${envAnterior}): ${descartadas.join(', ')}.` : ''));
          HH.save();
          notificarPartes(c, `A minuta do contrato ${c.numero} foi atualizada (versão ${c.versao}). Assine a nova versão enviada pelo provedor de assinatura.`);
          delete syncMsg[c.id];
          HH.toast(`Minuta atualizada para a versão ${c.versao}.`, 'ok');
          close(); HH.render();
          return true;
        } },
      ],
    });
  }

  // ---- UC10 principal + RN1: termo aditivo em contrato vigente ----
  const MODELOS = {
    '': '',
    'Prorrogação de prazo': (c) => `Fica prorrogado o prazo de vigência do contrato ${c.numero} por mais 12 (doze) meses, passando o término de ${HH.date(c.termino)} para ${HH.date(addMonths(c.termino || c.inicio || new Date().toISOString(), 12))}.`,
    'Reajuste de valor': (c) => `O valor do contrato ${c.numero}, atualmente de ${HH.money(c.valor)}, fica reajustado pela variação acumulada do ${c.indiceReajuste} no período, passando a vigorar o novo valor a partir do próximo vencimento.`,
    'Alteração de cláusula': (c) => `A cláusula ____ do contrato ${c.numero} passa a vigorar com a seguinte redação: "____".`,
  };
  function registrarAditivo(c) {
    HH.modal({
      title: `Termo aditivo – ${c.numero}`, wide: true,
      body: `<div class="alert warn">${esc(MSG.rn1Aditivo)}</div>
        <form class="form" data-ct-adit-form>
          <div class="field"><label>Modelo (opcional)</label><select class="input" name="modelo">${Object.keys(MODELOS).map((k) => `<option value="${esc(k)}">${esc(k || 'Sem modelo')}</option>`).join('')}</select><span class="hint">Preenche o novo texto com uma sugestão.</span></div>
          <div class="field"><label>Justificativa/Motivo *</label><textarea class="input" name="motivo" rows="2" placeholder="Ex.: prorrogação solicitada pelo locatário"></textarea><span class="error-msg hidden" data-ct-err="motivo"></span></div>
          <div class="field"><label>Novo texto do aditivo *</label><textarea class="input" name="texto" rows="5"></textarea><span class="error-msg hidden" data-ct-err="texto"></span></div>
        </form>`,
      onMount: (root) => {
        const form = root.querySelector('[data-ct-adit-form]');
        form.elements.modelo.addEventListener('change', (e) => { const fn = MODELOS[e.target.value]; if (fn) form.elements.texto.value = fn(c); });
      },
      actions: [
        { label: 'Cancelar' },
        { label: 'Salvar Aditivo', class: 'btn-primary', onClick: (close, root) => {
          const form = root.querySelector('[data-ct-adit-form]');
          const d = HH.formData(form);
          const errs = {};
          if (!d.motivo) errs.motivo = MSG.motivo; // E1
          if (!d.texto) errs.texto = 'Informe o novo texto do aditivo.';
          HH.markInvalid(form, Object.keys(errs));
          root.querySelectorAll('[data-ct-err]').forEach((el) => { const m = errs[el.dataset.ctErr]; el.textContent = m || ''; el.classList.toggle('hidden', !m); });
          if (errs.motivo || errs.texto) { HH.toast(errs.motivo || errs.texto, 'danger'); return false; }
          const me = HH.me();
          c.aditivos = c.aditivos || [];
          c.aditivos.push({ data: new Date().toISOString(), motivo: d.motivo, texto: d.texto, usuarioId: me && me.id });
          c.versao = (c.versao || 1) + 1;
          registrar(c, `Termo aditivo nº ${c.aditivos.length} registrado: ${d.motivo}.`);
          HH.save();
          notificarPartes(c, `Termo aditivo nº ${c.aditivos.length} registrado no contrato ${c.numero}: ${d.motivo}.`);
          HH.toast(`Termo aditivo registrado. Contrato na versão ${c.versao}.`, 'ok');
          close(); HH.render();
          return true;
        } },
      ],
    });
  }

  // ======================================================================
  // #/meus-contratos – cliente (comprador/locatário ou proprietário)
  // ======================================================================
  function papeisDoUsuario(c, u) {
    const pt = partes(c); const pp = papeis(c.tipo); const r = [];
    if (pt.proposta.clienteId === u.id) r.push(pp.comprador);
    if (pt.imovel.proprietarioId === u.id) r.push('Proprietário (' + pp.vendedor + ')');
    return r;
  }
  HH.route('#/meus-contratos', {
    title: 'Meus contratos', roles: ['cliente'],
    render: ({ user }) => {
      const cs = sortDesc(HH.db.contratos.filter((c) => papeisDoUsuario(c, user).length), 'criadoEm');
      return `<div class="page-head"><div><h1>Meus contratos</h1><p class="sub">Contratos em que você é comprador, locatário ou proprietário do imóvel. Somente leitura.</p></div></div>
        ${cs.length ? cs.map((c) => {
          const pt = partes(c); const s = c.serasa || {};
          return `<div class="card ct-meu">
            <div class="card-title"><div class="row">${HH.thumb(pt.imovel, 'sm')}<div><h3 style="margin:0">${esc(c.numero)} · ${esc(pt.imovel.titulo)}</h3><span class="small muted">${esc(pt.imovel.codigo)} · ${esc(c.tipo)} · você: ${esc(papeisDoUsuario(c, user).join(', '))}</span></div></div>${HH.badge(c.status)}</div>
            <div class="grid grid-3">
              <div>
                <dl class="ct-dl">
                  <dt>Valor</dt><dd>${HH.money(c.valor)}${c.tipo === 'Locação' ? '/mês' : ''}</dd>
                  <dt>Vigência</dt><dd>${HH.date(c.inicio)} a ${HH.date(c.termino)}</dd>
                  <dt>Vencimento</dt><dd>Dia ${esc(c.vencimento)}</dd>
                  <dt>Reajuste</dt><dd>${esc(c.indiceReajuste)}</dd>
                  <dt>Versão</dt><dd>v${esc(c.versao)}</dd>
                </dl>
                ${s.pendente ? `<span class="badge warn">${esc(MSG.pendente)}</span>` : ''}
              </div>
              <div><h4>Assinaturas <span class="small muted">${progTxt(c)}</span></h4>${progBar(c)}
                <ul class="ct-sign-list">${(c.assinaturas || []).map((a) => `<li><div class="row between"><span>${esc(a.nome)} <span class="small muted">(${esc(a.papel)})</span></span>${HH.badge(a.status)}</div>${a.data ? `<span class="small muted">${HH.dateTime(a.data)}</span>` : ''}</li>`).join('')}</ul>
              </div>
              <div><h4>Termos aditivos</h4>${aditivosHtml(c)}</div>
            </div>
            <div class="row end">
              <button class="btn btn-sm" data-ct-doc="${esc(c.id)}">Ver documento</button>
              ${c.pdfUrl ? `<button class="btn btn-sm btn-primary" data-ct-pdf="${esc(c.id)}">📄 Documento assinado (PDF)</button>` : ''}
            </div>
          </div>`;
        }).join('') : '<div class="empty">Você ainda não tem contratos.</div>'}`;
    },
    mount: (root) => {
      root.querySelectorAll('[data-ct-doc]').forEach((b) => b.addEventListener('click', () => { const c = HH.find('contratos', b.dataset.ctDoc); if (c) abrirDocumento(c); }));
      root.querySelectorAll('[data-ct-pdf]').forEach((b) => b.addEventListener('click', () => { const c = HH.find('contratos', b.dataset.ctPdf); if (c) abrirPdf(c); }));
    },
  });
  HH.nav({ label: 'Meus contratos', href: '#/meus-contratos', roles: ['cliente'], group: 'Cliente', order: 50 });

  // ======================================================================
  // Slots
  // ======================================================================
  HH.slot('proprietario.imovel', {
    order: 60,
    render: ({ imovel }) => {
      if (!imovel) return '';
      const cs = sortDesc(HH.db.contratos.filter((c) => c.imovelId === imovel.id), 'criadoEm');
      if (!cs.length) return '';
      const c = cs[0];
      return `<div class="card ct-slot"><div class="card-title"><h3>Contrato</h3>${HH.badge(c.status)}</div>
        <p class="small"><strong>${esc(c.numero)}</strong> · ${esc(c.tipo)} · ${HH.money(c.valor)}${c.tipo === 'Locação' ? '/mês' : ''} · v${esc(c.versao)}</p>
        <div class="small muted">${progTxt(c)} assinaturas colhidas</div>${progBar(c)}
        ${(c.aditivos || []).length ? `<p class="small">${c.aditivos.length} termo(s) aditivo(s) registrado(s).</p>` : ''}
        <a href="#/meus-contratos">Ver em Meus contratos</a></div>`;
    },
  });

  HH.slot('painel.pendencias', {
    order: 50,
    render: ({ user }) => {
      if (!HH.isStaff(user)) return '';
      const ag = HH.db.contratos.filter((c) => c.status === AG).map((c) => {
        const im = partes(c).imovel;
        return `<li><a href="#/contratos/${encodeURIComponent(c.id)}">Contrato ${esc(c.numero)} aguardando assinaturas (${progTxt(c)})</a><div class="when">${esc(im.codigo)} · ${esc(im.titulo)}</div></li>`;
      });
      const pr = prontas().map((p) => {
        const im = HH.find('imoveis', p.imovelId) || {};
        return `<li><a href="#/contratos/novo/${encodeURIComponent(p.id)}">Proposta de ${esc((usuario(p.clienteId) || {}).nome)} pronta para contrato</a><div class="when">${esc(im.codigo)} · ${esc(im.titulo)} · ${HH.money(HH.valorFinal(p))}</div></li>`;
      });
      return ag.concat(pr).join('');
    },
  });
})();
