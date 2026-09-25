/* HabitaHub – fatia vertical 4: Proposta.
 * UC07 Registrar Proposta Financeira + UC08 Confirmar Pagamento de Taxa.
 * Rotas: #/minhas-propostas (cliente), #/propostas (equipe).
 * Slots: imovel.detalhe.acoes, proprietario.imovel, painel.pendencias.
 * Ver prototipo/README.md.
 */
(function () {
  'use strict';
  const { esc } = HH;

  const MSG_VALOR = 'Por favor, informe um valor numérico válido.';
  const PAGAMENTOS = ['À vista', 'Financiamento', 'Entrada + Financiamento'];
  const msgFaixa = (imovel) => `O valor ofertado deve estar entre ${HH.money(imovel.valor * 0.5)} e ${HH.money(imovel.valor * 1.5)} (50% a 150% do valor anunciado).`;
  const msgValor = (valor, imovel) => (!isFinite(valor) || valor <= 0 ? MSG_VALOR : msgFaixa(imovel));
  const ATIVAS = ['Em Análise', 'Contraproposta', 'Aprovada'];
  const MAX_CARTA = 1.5 * 1024 * 1024; // limite do localStorage do protótipo

  // ---------- Utilitários locais ----------
  const im = (id) => HH.find('imoveis', id) || {};
  const us = (id) => HH.find('usuarios', id) || {};
  const primeiroNome = (u) => String((u && u.nome) || 'Cliente').split(/\s+/)[0];
  const now = () => new Date().toISOString();
  const byDataDesc = (a, b) => String(b.data).localeCompare(String(a.data));

  // Máscara BRL: dígitos → centavos → "1.234,56"
  function maskBRL(el) {
    el.addEventListener('input', () => {
      const d = HH.onlyDigits(el.value).replace(/^0+/, '').slice(0, 13);
      el.value = d ? (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    });
  }
  function parseBRL(s) {
    const str = String(s || '').trim();
    if (!str || /-/.test(str)) return NaN;
    const d = HH.onlyDigits(str);
    return d ? Number(d) / 100 : NaN;
  }
  const fmtBRLInput = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function diffPct(valor, anunciado) {
    if (!anunciado) return '';
    const d = ((valor - anunciado) / anunciado) * 100;
    const cls = d < 0 ? 'neg' : d > 0 ? 'pos' : '';
    return `<span class="pp-diff ${cls}">${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%</span>`;
  }

  function historicoHtml(p, limit) {
    const h = (p.historico || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const itens = limit ? h.slice(-limit) : h;
    if (!itens.length) return '<p class="small muted">Sem movimentações registradas.</p>';
    return `<ul class="timeline pp-timeline">${itens.map((x) => `<li><div>${esc(x.texto)}</div><div class="when">${HH.dateTime(x.data)}</div></li>`).join('')}</ul>`;
  }

  function addHistorico(p, texto) {
    p.historico = p.historico || [];
    p.historico.push({ data: now(), texto });
    HH.save();
  }

  // Notifica o cliente e o proprietário (ações da imobiliária).
  function notificarPartes(p, textoCliente, textoProp) {
    const imovel = im(p.imovelId);
    HH.notify(p.clienteId, textoCliente, '#/minhas-propostas');
    if (imovel.proprietarioId && imovel.proprietarioId !== p.clienteId) HH.notify(imovel.proprietarioId, textoProp, '#/meus-imoveis/' + imovel.id);
  }
  // Notifica o corretor (equipe) e o proprietário (ações do cliente).
  function notificarEquipeEProprietario(p, textoEquipe, textoProp) {
    const imovel = im(p.imovelId);
    HH.notifyStaff(textoEquipe, '#/propostas');
    if (imovel.proprietarioId && imovel.proprietarioId !== p.clienteId) HH.notify(imovel.proprietarioId, textoProp, '#/meus-imoveis/' + imovel.id);
  }

  const propostaAtiva = (imovelId, clienteId) =>
    HH.db.propostas.filter((p) => p.imovelId === imovelId && p.clienteId === clienteId && ATIVAS.includes(p.status)).sort(byDataDesc)[0] || null;

  function labelTaxa(p) {
    return im(p.imovelId).modalidade === 'Aluguel' ? 'Taxa de reserva (1º aluguel)' : 'Taxa de reserva (sinal)';
  }

  // ---------- Carta de crédito (A1 do UC07) ----------
  function dataUrlToBlobUrl(dataUrl) {
    try {
      const [head, b64] = dataUrl.split(',');
      const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch (e) { return null; }
  }
  function cartaCell(p) {
    if (p.cartaArquivo && p.cartaArquivo.dataUrl) return `<a href="#" data-proposta-carta="${esc(p.id)}" title="${esc(p.cartaArquivo.nome)}">📎 Abrir carta</a>`;
    if (p.cartaCredito) return '<span class="small muted">Declarada (sem arquivo)</span>';
    return '<span class="muted">—</span>';
  }
  function abrirCarta(p) {
    const arq = p && p.cartaArquivo;
    if (!arq || !arq.dataUrl) { HH.toast('Nenhum arquivo de carta de crédito anexado.', 'warn'); return; }
    const blobUrl = dataUrlToBlobUrl(arq.dataUrl);
    const isImg = /^data:image\//.test(arq.dataUrl);
    const isPdf = /^data:application\/pdf/.test(arq.dataUrl);
    const preview = isImg ? `<img class="pp-carta-img" src="${esc(arq.dataUrl)}" alt="Carta de crédito">`
      : isPdf && blobUrl ? `<iframe class="pp-carta-frame" src="${esc(blobUrl)}" title="Carta de crédito"></iframe>`
      : '<div class="empty">Pré-visualização indisponível para este formato. Use o botão de download.</div>';
    HH.modal({
      title: 'Carta de crédito', wide: true,
      body: `<p class="small muted">Arquivo: <strong>${esc(arq.nome)}</strong></p>${preview}
        <div class="row end" style="margin-top:12px"><a class="btn btn-sm" href="${esc(blobUrl || arq.dataUrl)}" download="${esc(arq.nome)}">Baixar arquivo</a></div>`,
      onClose: () => { if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); },
    });
  }

  // ---------- UC07: formulário de proposta ----------
  function abrirFormProposta(imovelId) {
    const imovel = im(imovelId);
    const user = HH.me();
    if (!user || imovel.status !== 'Disponível') { HH.toast('Imóvel não disponível para propostas.', 'danger'); return; }
    let carta = null; // { nome, dataUrl }

    const body = `<form class="form" data-pp-form novalidate>
      <div class="pp-ref">
        ${HH.thumb(imovel, 'sm')}
        <div><div class="small muted">${esc(imovel.codigo)} · ${esc(imovel.modalidade)}</div>
          <strong>${esc(imovel.titulo)}</strong>
          <div>Valor anunciado: <strong>${HH.money(imovel.valor)}</strong>${imovel.modalidade === 'Aluguel' ? ' <span class="small muted">/mês</span>' : ''}</div></div>
      </div>
      <div data-pp-erro></div>
      <div class="field"><label for="pp-valor">Valor ofertado *</label>
        <div class="pp-money"><span>R$</span><input class="input" id="pp-valor" name="valor" inputmode="numeric" autocomplete="off" placeholder="0,00"></div>
        <span class="hint">Informe um valor compatível com o anunciado (entre 50% e 150%).</span></div>
      <div class="field"><label for="pp-pag">Tipo de pagamento *</label>
        <select class="input" id="pp-pag" name="pagamento">${PAGAMENTOS.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="pp-obs">Observações</label>
        <textarea class="input" id="pp-obs" name="obs" maxlength="600" placeholder="Condições, prazos, dúvidas…"></textarea></div>
      <div class="field"><label for="pp-carta">Carta de crédito (opcional)</label>
        <input class="input" id="pp-carta" type="file" name="carta" accept=".pdf,image/*">
        <span class="hint" data-pp-carta-info>Anexe o comprovante de pré-aprovação de financiamento (PDF ou imagem, até 1,5 MB).</span></div>
    </form>`;

    HH.modal({
      title: 'Fazer proposta', body,
      actions: [
        { label: 'Cancelar' },
        { label: 'Limpar', onClick: (close, root) => {
          const f = root.querySelector('[data-pp-form]'); f.reset(); carta = null;
          HH.markInvalid(f, []); root.querySelector('[data-pp-erro]').innerHTML = '';
          root.querySelector('[data-pp-carta-info]').textContent = 'Anexe o comprovante de pré-aprovação de financiamento (PDF ou imagem, até 1,5 MB).';
          return false;
        } },
        { label: 'Enviar Proposta', class: 'btn-primary', onClick: (close, root) => enviarProposta(root, imovelId, carta) },
      ],
      onMount: (root) => {
        const f = root.querySelector('[data-pp-form]');
        f.addEventListener('submit', (e) => e.preventDefault());
        maskBRL(f.elements.valor);
        f.elements.valor.focus();
        f.elements.carta.addEventListener('change', (e) => {
          const info = root.querySelector('[data-pp-carta-info]');
          const file = e.target.files && e.target.files[0];
          carta = null;
          if (!file) return;
          if (file.size > MAX_CARTA) { e.target.value = ''; info.innerHTML = '<span class="error-msg">O arquivo deve ter no máximo 1,5 MB.</span>'; return; }
          const reader = new FileReader();
          reader.onload = () => { carta = { nome: file.name, dataUrl: reader.result }; info.textContent = '✔ ' + file.name + ' anexado.'; };
          reader.onerror = () => { info.innerHTML = '<span class="error-msg">Não foi possível ler o arquivo.</span>'; };
          reader.readAsDataURL(file);
        });
      },
    });
  }

  function enviarProposta(root, imovelId, carta) {
    const f = root.querySelector('[data-pp-form]');
    const erro = root.querySelector('[data-pp-erro]');
    const d = HH.formData(f);
    const imovel = im(imovelId);
    const user = HH.me();
    const valor = parseBRL(d.valor);
    // Passo 5 / E1: nulo, negativo ou desproporcional ao anunciado.
    if (!isFinite(valor) || valor <= 0 || valor < imovel.valor * 0.5 || valor > imovel.valor * 1.5) {
      HH.markInvalid(f, ['valor']);
      erro.innerHTML = `<div class="alert danger">${esc(msgValor(valor, imovel))}</div>`;
      f.elements.valor.focus();
      return false;
    }
    if (imovel.status !== 'Disponível') {
      erro.innerHTML = '<div class="alert danger">Imóvel não disponível para propostas.</div>';
      return false;
    }
    if (propostaAtiva(imovelId, user.id)) {
      erro.innerHTML = '<div class="alert warn">Você já possui uma proposta ativa para este imóvel.</div>';
      return false;
    }
    const pagamento = PAGAMENTOS.includes(d.pagamento) ? d.pagamento : PAGAMENTOS[0];
    // Passo 6 / RN1: grava com status "Em Análise".
    const p = HH.insert('propostas', {
      id: HH.uid('p'), imovelId, clienteId: user.id, valor, pagamento, obs: d.obs || '',
      cartaCredito: !!carta, cartaArquivo: carta, status: 'Em Análise', contraproposta: null,
      historico: [{ data: now(), texto: `Proposta de ${HH.money(valor)} enviada (${pagamento})${carta ? ', com carta de crédito anexada' : ''}.` }],
      data: now(),
    });
    // Passo 7: notifica corretor e proprietário.
    notificarEquipeEProprietario(p,
      `${user.nome} enviou uma proposta de ${HH.money(valor)} para ${imovel.codigo}.`,
      `Nova proposta de ${HH.money(valor)} para "${imovel.titulo}".`);
    HH.toast('Proposta enviada com sucesso! Status: Em Análise.', 'ok');
    setTimeout(() => HH.render(), 0);
    return true;
  }

  // ---------- UC08: pagamento da taxa de reserva ----------
  // QR Code ilustrativo: grade pseudo-aleatória derivada do txid + marcadores de canto.
  function qrSvg(txid) {
    const N = 25;
    let seed = parseInt(HH.hash(txid).slice(1), 16) || 1;
    const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const finder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
    let rects = '';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (finder(x, y)) continue;
      if ((x === 7 || y === 7 || x === N - 8 || y === N - 8) && (x < 8 || y < 8 || x > N - 9 || y > N - 9)) continue;
      if (rnd() < 0.5) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    const mark = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
    return `<svg class="pp-qr" viewBox="-2 -2 ${N + 4} ${N + 4}" shape-rendering="crispEdges" role="img" aria-label="QR Code PIX">
      <rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#fff"/><g fill="#111">${mark(0, 0)}${mark(N - 7, 0)}${mark(0, N - 7)}${rects}</g></svg>`;
  }

  function comprovanteHtml(p, pg) {
    const imovel = im(p.imovelId);
    return `<div class="pp-comprovante">
      <div class="row between"><strong>Comprovante de pagamento</strong>${HH.badge(pg.status)}</div>
      <dl>
        <dt>ID da transação</dt><dd><code>${esc(pg.transacaoId)}</code></dd>
        <dt>Forma</dt><dd>${esc(pg.forma)}</dd>
        <dt>Valor</dt><dd>${HH.money(pg.valor)}</dd>
        <dt>Data</dt><dd>${HH.dateTime(pg.data)}</dd>
        <dt>Imóvel</dt><dd>${esc(imovel.codigo)} · ${esc(imovel.titulo)}</dd>
      </dl>
    </div>`;
  }

  // Passo 6 / RN1: registra o pagamento, reserva o imóvel, histórico e notificações.
  function registrarPagamento(propostaId, r, forma, valor) {
    const ja = HH.pagamentoDe(propostaId);
    if (ja) return ja;
    const p = HH.find('propostas', propostaId);
    const imovel = im(p.imovelId);
    const pg = HH.insert('pagamentos', { id: HH.uid('pg'), propostaId, forma, valor: r.valor != null ? r.valor : valor, status: 'Pago', transacaoId: r.transacaoId, data: r.data || now() });
    if (imovel.id) HH.update('imoveis', imovel.id, { status: 'Reservado' });
    addHistorico(p, `Taxa de reserva de ${HH.money(pg.valor)} paga via ${forma} (transação ${pg.transacaoId}). Imóvel reservado.`);
    const cli = us(p.clienteId);
    notificarEquipeEProprietario(p,
      `${cli.nome || 'Cliente'} pagou a taxa de reserva de ${imovel.codigo} (${HH.money(pg.valor)}). Imóvel Reservado.`,
      `Seu imóvel "${imovel.titulo}" foi reservado: taxa de reserva de ${HH.money(pg.valor)} confirmada.`);
    return pg;
  }

  function abrirPagamento(propostaId) {
    const p = HH.find('propostas', propostaId);
    if (!p || p.status !== 'Aprovada') { HH.toast('A taxa de reserva só pode ser paga depois que a proposta for aprovada.', 'warn'); return; }
    if (HH.pagamentoDe(p.id)) { HH.toast('A taxa de reserva desta proposta já foi paga.', 'warn'); return; }
    const imovel = im(p.imovelId);
    if (imovel.status !== 'Disponível') { HH.toast('Imóvel não disponível para reserva.', 'danger'); return; }
    const valor = HH.taxaReserva(p);
    let forma = 'PIX';
    let processando = false;
    let fechado = false;
    let pago = false;

    const body = `<div data-pp-pay>
      <div class="pp-ref">${HH.thumb(imovel, 'sm')}
        <div><div class="small muted">${esc(imovel.codigo)} · valor negociado ${HH.money(HH.valorFinal(p))}</div><strong>${esc(imovel.titulo)}</strong>
          <div>${esc(labelTaxa(p))}: <strong class="pp-taxa">${HH.money(valor)}</strong></div></div></div>
      <div class="pp-opcoes" role="radiogroup" aria-label="Forma de pagamento">
        <label><input type="radio" name="pp-forma" value="PIX" checked> <span><strong>PIX</strong><br><span class="small muted">QR Code dinâmico</span></span></label>
        <label><input type="radio" name="pp-forma" value="Cartão de Crédito"> <span><strong>Cartão de Crédito</strong><br><span class="small muted">Aprovação imediata</span></span></label>
      </div>
      <div data-pp-msg></div>
      <form class="form hidden" data-pp-cartao novalidate>
        <div class="field"><label for="pp-cc-num">Número do cartão *</label><input class="input" id="pp-cc-num" name="numero" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000"></div>
        <div class="field"><label for="pp-cc-nome">Nome impresso no cartão *</label><input class="input" id="pp-cc-nome" name="nome" autocomplete="cc-name" placeholder="Como está no cartão"></div>
        <div class="grid grid-2">
          <div class="field"><label for="pp-cc-val">Validade *</label><input class="input" id="pp-cc-val" name="validade" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA"></div>
          <div class="field"><label for="pp-cc-cvv">CVV *</label><input class="input" id="pp-cc-cvv" name="cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="000"></div>
        </div>
      </form>
      <div data-pp-pix><p class="small muted">Ao gerar a cobrança, um QR Code PIX dinâmico será exibido. A confirmação chega automaticamente pelo banco.</p></div>
      <div class="modal-foot pp-foot">
        <button class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary" data-pp-processar>Gerar QR Code PIX</button>
      </div>
    </div>`;

    HH.modal({
      title: 'Pagar Taxa de Reserva', body, actions: [],
      onClose: () => { fechado = true; if (pago) HH.render(); },
      onMount: (root) => {
        const box = root.querySelector('[data-pp-pay]');
        const msg = box.querySelector('[data-pp-msg]');
        const fCartao = box.querySelector('[data-pp-cartao]');
        const pixBox = box.querySelector('[data-pp-pix]');
        const btn = box.querySelector('[data-pp-processar]');
        const setMsg = (html) => { msg.innerHTML = html; };

        // Máscaras do cartão
        const el = fCartao.elements;
        el.numero.addEventListener('input', () => { el.numero.value = HH.onlyDigits(el.numero.value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
        el.validade.addEventListener('input', () => { const d = HH.onlyDigits(el.validade.value).slice(0, 4); el.validade.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; });
        el.cvv.addEventListener('input', () => { el.cvv.value = HH.onlyDigits(el.cvv.value).slice(0, 4); });
        fCartao.addEventListener('submit', (e) => e.preventDefault());

        box.querySelectorAll('input[name="pp-forma"]').forEach((r) => r.addEventListener('change', () => {
          forma = r.value;
          fCartao.classList.toggle('hidden', forma !== 'Cartão de Crédito');
          pixBox.classList.toggle('hidden', forma !== 'PIX');
          btn.textContent = forma === 'PIX' ? 'Gerar QR Code PIX' : 'Processar Pagamento';
          setMsg('');
        }));

        const lockOpcoes = (lock) => box.querySelectorAll('input[name="pp-forma"]').forEach((r) => { r.disabled = lock; });

        const sucesso = (pg) => {
          pago = true;
          if (fechado) { HH.toast('Pagamento confirmado! O imóvel foi reservado.', 'ok'); HH.render(); return; }
          box.innerHTML = `<div class="alert ok">Pagamento confirmado! O imóvel <strong>${esc(imovel.titulo)}</strong> agora está <strong>Reservado</strong>.</div>
            ${comprovanteHtml(p, pg)}
            <div class="modal-foot pp-foot"><button class="btn btn-primary" data-close>Fechar</button></div>`;
          HH.toast('Pagamento confirmado!', 'ok');
        };
        const falha = (e, formaUsada) => {
          const texto = (e && e.message) || 'Instabilidade no serviço de pagamento. Verifique seu extrato antes de tentar novamente.';
          const pAtual = HH.find('propostas', p.id);
          addHistorico(pAtual, `Tentativa de pagamento via ${formaUsada} não concluída: ${texto}`);
          if (fechado) { HH.toast(texto, 'danger'); return; }
          setMsg(`<div class="alert danger">${esc(texto)}</div>`);
        };

        async function pagarCartao() {
          const d = HH.formData(fCartao);
          const bad = [];
          const num = HH.onlyDigits(d.numero);
          if (num.length < 13 || num.length > 16) bad.push('numero');
          if (d.nome.length < 3) bad.push('nome');
          const m = d.validade.match(/^(\d{2})\/(\d{2})$/);
          let venc = false;
          if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) bad.push('validade');
          else { const fim = new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59); venc = fim < new Date(); if (venc) bad.push('validade'); }
          const cvv = HH.onlyDigits(d.cvv);
          if (cvv.length < 3) bad.push('cvv');
          HH.markInvalid(fCartao, bad);
          if (bad.length) { setMsg(`<div class="alert danger">${venc && bad.length === 1 ? 'Cartão vencido. Informe outro cartão.' : 'Verifique os dados do cartão destacados.'}</div>`); return; }
          setMsg('<div class="alert info"><span class="spinner"></span> Enviando cobrança ao Gateway de Pagamento…</div>');
          processando = true; lockOpcoes(true);
          try {
            const r = await HH.busy(btn, HH.api.cobrar({ forma: 'Cartão de Crédito', valor }));
            sucesso(registrarPagamento(p.id, r, 'Cartão de Crédito', valor));
          } catch (e) { falha(e, 'Cartão de Crédito'); } finally { processando = false; if (!pago) lockOpcoes(false); }
        }

        async function pagarPix() {
          setMsg('');
          processando = true; lockOpcoes(true);
          let cob;
          try { cob = await HH.busy(btn, HH.api.gerarPix(valor)); } catch (e) { processando = false; lockOpcoes(false); falha(e, 'PIX'); return; }
          if (fechado) { processando = false; return; }
          btn.classList.add('hidden');
          pixBox.innerHTML = `<div class="pp-pix">
            ${qrSvg(cob.txid)}
            <div class="pp-pix-info">
              <div class="small muted">TXID ${esc(cob.txid)} · ${HH.money(cob.valor)}</div>
              <label class="small" for="pp-cc">PIX copia e cola</label>
              <textarea class="input pp-copia" id="pp-cc" readonly>${esc(cob.copiaECola)}</textarea>
              <button class="btn btn-sm" data-pp-copiar>Copiar código</button>
              <div class="alert warn pp-status" data-pp-status><span class="spinner"></span> Aguardando confirmação do banco…</div>
            </div></div>`;
          pixBox.querySelector('[data-pp-copiar]').addEventListener('click', () => copiar(pixBox.querySelector('.pp-copia')));
          try {
            const r = await HH.api.aguardarPix(cob.txid, valor); // webhook simulado do Gateway
            sucesso(registrarPagamento(p.id, r, 'PIX', valor));
          } catch (e) {
            falha(e, 'PIX');
            if (!fechado) {
              const st = pixBox.querySelector('[data-pp-status]');
              if (st) { st.className = 'alert danger pp-status'; st.textContent = 'Cobrança PIX não confirmada.'; }
              btn.classList.remove('hidden'); btn.textContent = 'Gerar novo QR Code PIX';
            }
          } finally { processando = false; if (!pago && !fechado) lockOpcoes(false); }
        }

        btn.addEventListener('click', () => {
          if (processando || pago) return;
          if (forma === 'PIX') pagarPix(); else pagarCartao();
        });
      },
    });
  }

  function copiar(ta) {
    const ok = () => HH.toast('Código PIX copiado.', 'ok');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(ta.value).then(ok, () => { ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { HH.toast('Selecione e copie o código manualmente.', 'warn'); } });
    } else {
      ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { HH.toast('Selecione e copie o código manualmente.', 'warn'); }
    }
  }

  // ---------- Slot: botão "Fazer proposta" na página do imóvel ----------
  HH.slot('imovel.detalhe.acoes', {
    order: 30,
    render: ({ imovel, user }) => {
      if (!imovel || !user || user.perfil !== 'cliente') return '';
      const ativa = propostaAtiva(imovel.id, user.id);
      if (ativa) {
        const pago = HH.pagamentoDe(ativa.id);
        return `<div class="pp-status-chip">Sua proposta: ${HH.badge(ativa.status)} ${pago ? HH.badge('Pago') : ''} <a href="#/minhas-propostas">Ver detalhes</a></div>`;
      }
      if (imovel.status !== 'Disponível' || imovel.proprietarioId === user.id) return '';
      return `<button class="btn btn-primary" data-proposta-fazer="${esc(imovel.id)}">Fazer proposta</button>`;
    },
    mount: (root, { imovel }) => {
      root.querySelectorAll('[data-proposta-fazer]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        abrirFormProposta(b.dataset.propostaFazer || (imovel && imovel.id));
      }));
    },
  });

  // ---------- Rota: Minhas propostas (cliente) ----------
  function cardCliente(p) {
    const imovel = im(p.imovelId);
    const pg = HH.pagamentoDe(p.id);
    let acoes = '';
    let extra = '';
    if (p.status === 'Contraproposta') {
      extra = `<div class="alert info">A imobiliária enviou uma contraproposta de <strong>${HH.money(p.contraproposta)}</strong>${p.msgContraproposta ? `: “${esc(p.msgContraproposta)}”` : '.'}</div>`;
      acoes = `<button class="btn btn-primary btn-sm" data-pp-aceitar="${esc(p.id)}">Aceitar</button><button class="btn btn-sm" data-pp-recusar="${esc(p.id)}">Recusar</button>`;
    } else if (p.status === 'Aprovada' && !pg) {
      extra = `<div class="alert ok">Proposta aprovada! ${esc(labelTaxa(p))}: <strong>${HH.money(HH.taxaReserva(p))}</strong>.</div>`;
      acoes = imovel.status === 'Disponível'
        ? `<button class="btn btn-primary btn-sm" data-pp-pagar="${esc(p.id)}">Pagar Taxa de Reserva</button>`
        : '<span class="small muted">Imóvel não está mais disponível para reserva.</span>';
    } else if (p.status === 'Aprovada' && pg) {
      extra = comprovanteHtml(p, pg);
    } else if (p.status === 'Recusada' && p.motivoRecusa) {
      extra = `<div class="alert danger">Motivo: ${esc(p.motivoRecusa)}</div>`;
    }
    return `<div class="card pp-card">
      <div class="pp-card-head">
        ${HH.thumb(imovel, 'sm')}
        <div class="pp-grow"><div class="small muted">${esc(imovel.codigo)} · ${esc(imovel.modalidade)} · anunciado ${HH.money(imovel.valor)}</div>
          <a href="#/imovel/${esc(imovel.id)}"><strong>${esc(imovel.titulo)}</strong></a></div>
        <div>${HH.badge(p.status)}</div>
      </div>
      <div class="pp-meta">
        <div><span class="small muted">Valor ofertado</span><br><strong>${HH.money(p.valor)}</strong></div>
        ${p.contraproposta != null ? `<div><span class="small muted">Contraproposta</span><br><strong>${HH.money(p.contraproposta)}</strong></div>` : ''}
        <div><span class="small muted">Pagamento</span><br>${esc(p.pagamento)}</div>
        <div><span class="small muted">Enviada em</span><br>${HH.date(p.data)}</div>
        <div><span class="small muted">Carta de crédito</span><br>${cartaCell(p)}</div>
      </div>
      ${p.obs ? `<p class="small"><span class="muted">Observações:</span> ${esc(p.obs)}</p>` : ''}
      ${extra}
      <details class="pp-hist"><summary>Histórico (${(p.historico || []).length})</summary>${historicoHtml(p)}</details>
      ${acoes ? `<div class="row end">${acoes}</div>` : ''}
    </div>`;
  }

  HH.route('#/minhas-propostas', {
    title: 'Minhas propostas', roles: ['cliente'],
    render: ({ user }) => {
      const list = HH.where('propostas', (p) => p.clienteId === user.id).sort(byDataDesc);
      return `<div class="page-head"><div><h1>Minhas propostas ${HH.ucTag(['UC07', 'UC08'])}</h1>
        <p class="sub">Acompanhe suas propostas, responda contrapropostas e pague a taxa de reserva.</p></div>
        <a class="btn" href="#/catalogo">Ver catálogo</a></div>
        ${list.length ? `<div class="pp-list">${list.map(cardCliente).join('')}</div>` : '<div class="empty">Você ainda não enviou propostas. Encontre um imóvel no catálogo e clique em "Fazer proposta".</div>'}`;
    },
    mount: (root, { user }) => {
      root.addEventListener('click', async (e) => {
        const carta = e.target.closest('[data-proposta-carta]');
        if (carta) { e.preventDefault(); abrirCarta(HH.find('propostas', carta.dataset.propostaCarta)); return; }
        const pagar = e.target.closest('[data-pp-pagar]');
        if (pagar) { abrirPagamento(pagar.dataset.ppPagar); return; }
        const aceitar = e.target.closest('[data-pp-aceitar]');
        const recusar = e.target.closest('[data-pp-recusar]');
        if (!aceitar && !recusar) return;
        const p = HH.find('propostas', (aceitar || recusar).dataset[aceitar ? 'ppAceitar' : 'ppRecusar']);
        if (!p || p.status !== 'Contraproposta' || p.clienteId !== user.id) return;
        const imovel = im(p.imovelId);
        if (aceitar) {
          const ok = await HH.confirm(`Aceitar a contraproposta de ${HH.money(p.contraproposta)} para "${imovel.titulo}"?`, { title: 'Aceitar contraproposta', ok: 'Aceitar' });
          if (!ok) return;
          p.status = 'Aprovada';
          addHistorico(p, `Contraproposta de ${HH.money(p.contraproposta)} aceita pelo cliente. Valor final: ${HH.money(HH.valorFinal(p))}.`);
          notificarEquipeEProprietario(p,
            `${user.nome} aceitou a contraproposta de ${HH.money(p.contraproposta)} para ${imovel.codigo}.`,
            `A contraproposta de ${HH.money(p.contraproposta)} para "${imovel.titulo}" foi aceita pelo cliente.`);
          HH.toast('Contraproposta aceita! Agora você pode pagar a taxa de reserva.', 'ok');
        } else {
          const ok = await HH.confirm(`Recusar a contraproposta de ${HH.money(p.contraproposta)}? A proposta será encerrada.`, { title: 'Recusar contraproposta', ok: 'Recusar', danger: true });
          if (!ok) return;
          p.status = 'Recusada';
          p.motivoRecusa = 'Contraproposta recusada pelo cliente.';
          addHistorico(p, 'Contraproposta recusada pelo cliente.');
          notificarEquipeEProprietario(p,
            `${user.nome} recusou a contraproposta para ${imovel.codigo}.`,
            `A contraproposta para "${imovel.titulo}" foi recusada pelo cliente.`);
          HH.toast('Contraproposta recusada.', 'warn');
        }
        HH.save();
        HH.render();
      });
    },
  });
  HH.nav({ label: 'Minhas propostas', href: '#/minhas-propostas', roles: ['cliente'], group: 'Cliente', order: 30 });

  // ---------- Rota: Propostas (equipe) ----------
  const ABAS = [['Em Análise', 'Em Análise'], ['Contraproposta', 'Contraproposta'], ['Aprovada', 'Aprovadas'], ['Recusada', 'Recusadas']];
  let aba = 'Em Análise';

  function linhaEquipe(p) {
    const imovel = im(p.imovelId);
    const cli = us(p.clienteId);
    const pg = HH.pagamentoDe(p.id);
    const taxa = p.status === 'Aprovada' ? (pg ? `${HH.badge('Pago')}<div class="small muted">${esc(pg.forma)} · ${HH.money(pg.valor)}</div>` : `${HH.badge('Pendente')}<div class="small muted">Taxa ${HH.money(HH.taxaReserva(p))}</div>`) : '';
    const acoes = p.status === 'Em Análise'
      ? `<button class="btn btn-sm btn-primary" data-pp-acao="aprovar" data-id="${esc(p.id)}">Aprovar</button>
         <button class="btn btn-sm" data-pp-acao="contrapropor" data-id="${esc(p.id)}">Contrapropor</button>
         <button class="btn btn-sm btn-danger" data-pp-acao="recusar" data-id="${esc(p.id)}">Recusar</button>`
      : '';
    return `<tr>
      <td><div class="row" style="flex-wrap:nowrap">${HH.thumb(imovel, 'sm')}<div><strong>${esc(imovel.codigo)}</strong><div class="small">${esc(imovel.titulo)}</div>${HH.badge(imovel.status)}</div></div></td>
      <td>${esc(cli.nome)}<div class="small muted">${esc(cli.email)}</div></td>
      <td class="pp-nowrap"><strong>${HH.money(p.valor)}</strong><div class="small muted">anunciado ${HH.money(imovel.valor)}</div>${diffPct(p.valor, imovel.valor)}
        ${p.contraproposta != null ? `<div class="small">Contraproposta: <strong>${HH.money(p.contraproposta)}</strong></div>` : ''}</td>
      <td>${esc(p.pagamento)}${taxa ? `<div style="margin-top:4px">${taxa}</div>` : ''}</td>
      <td>${cartaCell(p)}</td>
      <td class="pp-nowrap">${HH.date(p.data)}</td>
      <td><div class="row">${acoes}<button class="btn btn-sm btn-ghost" data-pp-acao="historico" data-id="${esc(p.id)}">Histórico</button></div>
        ${p.status === 'Recusada' && p.motivoRecusa ? `<div class="small muted">Motivo: ${esc(p.motivoRecusa)}</div>` : ''}</td>
    </tr>`;
  }

  HH.route('#/propostas', {
    title: 'Propostas', roles: ['corretor', 'admin'],
    render: () => {
      const all = HH.db.propostas;
      const list = all.filter((p) => p.status === aba).sort(byDataDesc);
      return `<div class="page-head"><div><h1>Propostas ${HH.ucTag(['UC07', 'UC08'])}</h1>
        <p class="sub">Analise as propostas recebidas: aprove, recuse ou envie uma contraproposta.</p></div></div>
        <div class="tabs">${ABAS.map(([k, l]) => `<button data-pp-aba="${esc(k)}" class="${aba === k ? 'active' : ''}">${esc(l)} <span class="badge">${all.filter((p) => p.status === k).length}</span></button>`).join('')}</div>
        ${list.length ? `<div class="card table-wrap"><table class="table pp-table"><thead><tr>
          <th>Imóvel</th><th>Cliente</th><th>Ofertado × anunciado</th><th>Pagamento</th><th>Carta de crédito</th><th>Data</th><th>Ações</th>
        </tr></thead><tbody>${list.map(linhaEquipe).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma proposta nesta situação.</div>'}`;
    },
    mount: (root) => {
      root.addEventListener('click', (e) => {
        const t = e.target.closest('[data-pp-aba]');
        if (t) { aba = t.dataset.ppAba; HH.render(); return; }
        const carta = e.target.closest('[data-proposta-carta]');
        if (carta) { e.preventDefault(); abrirCarta(HH.find('propostas', carta.dataset.propostaCarta)); return; }
        const b = e.target.closest('[data-pp-acao]');
        if (!b) return;
        const p = HH.find('propostas', b.dataset.id);
        if (!p) return;
        const act = b.dataset.ppAcao;
        if (act === 'historico') { HH.modal({ title: 'Histórico da proposta', body: historicoHtml(p) }); return; }
        if (p.status !== 'Em Análise') { HH.toast('Esta proposta não está mais em análise.', 'warn'); HH.render(); return; }
        if (act === 'aprovar') aprovar(p);
        if (act === 'recusar') recusar(p);
        if (act === 'contrapropor') contrapropor(p);
      });
    },
  });
  HH.nav({ label: 'Propostas', href: '#/propostas', roles: ['corretor', 'admin'], group: 'Imobiliária', order: 30 });

  async function aprovar(p) {
    const imovel = im(p.imovelId);
    const cli = us(p.clienteId);
    if (imovel.status !== 'Disponível') { HH.toast('Imóvel não disponível: não é possível aprovar a proposta.', 'danger'); return; }
    const ok = await HH.confirm(`Aprovar a proposta de ${HH.money(p.valor)} de ${cli.nome} para ${imovel.codigo}?`, { title: 'Aprovar proposta', ok: 'Aprovar' });
    if (!ok) return;
    p.status = 'Aprovada';
    addHistorico(p, `Proposta aprovada pela imobiliária (${HH.me().nome}).`);
    notificarPartes(p,
      `Sua proposta para "${imovel.titulo}" foi aprovada! Pague a taxa de reserva para garantir o imóvel.`,
      `A proposta de ${HH.money(p.valor)} de ${primeiroNome(cli)} para "${imovel.titulo}" foi aprovada.`);
    HH.toast('Proposta aprovada.', 'ok');
    HH.render();
  }

  function recusar(p) {
    const imovel = im(p.imovelId);
    const cli = us(p.clienteId);
    HH.modal({
      title: 'Recusar proposta',
      body: `<form class="form" data-pp-recusa novalidate><p>Proposta de <strong>${HH.money(p.valor)}</strong> de ${esc(cli.nome)} para ${esc(imovel.codigo)}.</p>
        <div class="field"><label for="pp-motivo">Motivo da recusa *</label><textarea class="input" id="pp-motivo" name="motivo" maxlength="400"></textarea>
        <span class="error-msg hidden" data-pp-motivo-erro>Informe o motivo da recusa.</span></div></form>`,
      onMount: (root) => { const f = root.querySelector('form'); f.addEventListener('submit', (e) => e.preventDefault()); f.elements.motivo.focus(); },
      actions: [
        { label: 'Cancelar' },
        { label: 'Recusar proposta', class: 'btn-danger', onClick: (close, root) => {
          const f = root.querySelector('[data-pp-recusa]');
          const motivo = f.elements.motivo.value.trim();
          if (!motivo) { HH.markInvalid(f, ['motivo']); root.querySelector('[data-pp-motivo-erro]').classList.remove('hidden'); return false; }
          p.status = 'Recusada';
          p.motivoRecusa = motivo;
          addHistorico(p, `Proposta recusada pela imobiliária. Motivo: ${motivo}`);
          notificarPartes(p,
            `Sua proposta para "${imovel.titulo}" foi recusada. Motivo: ${motivo}`,
            `A proposta de ${HH.money(p.valor)} para "${imovel.titulo}" foi recusada pela imobiliária.`);
          HH.toast('Proposta recusada.', 'warn');
          setTimeout(() => HH.render(), 0);
          return true;
        } },
      ],
    });
  }

  function contrapropor(p) {
    const imovel = im(p.imovelId);
    const cli = us(p.clienteId);
    HH.modal({
      title: 'Enviar contraproposta',
      body: `<form class="form" data-pp-contra novalidate>
        <p>Proposta de <strong>${HH.money(p.valor)}</strong> de ${esc(cli.nome)} · anunciado ${HH.money(imovel.valor)}.</p>
        <div data-pp-erro></div>
        <div class="field"><label for="pp-contra-valor">Valor da contraproposta *</label>
          <div class="pp-money"><span>R$</span><input class="input" id="pp-contra-valor" name="valor" inputmode="numeric" autocomplete="off" value="${esc(fmtBRLInput(imovel.valor))}"></div></div>
        <div class="field"><label for="pp-contra-msg">Mensagem ao cliente</label><textarea class="input" id="pp-contra-msg" name="msg" maxlength="400"></textarea></div>
      </form>`,
      onMount: (root) => { const f = root.querySelector('form'); f.addEventListener('submit', (e) => e.preventDefault()); maskBRL(f.elements.valor); f.elements.valor.focus(); },
      actions: [
        { label: 'Cancelar' },
        { label: 'Enviar contraproposta', class: 'btn-primary', onClick: (close, root) => {
          const f = root.querySelector('[data-pp-contra]');
          const valor = parseBRL(f.elements.valor.value);
          if (!isFinite(valor) || valor <= 0 || valor < imovel.valor * 0.5 || valor > imovel.valor * 1.5) {
            HH.markInvalid(f, ['valor']);
            root.querySelector('[data-pp-erro]').innerHTML = `<div class="alert danger">${esc(msgValor(valor, imovel))}</div>`;
            return false;
          }
          const msg = f.elements.msg.value.trim();
          p.status = 'Contraproposta';
          p.contraproposta = valor;
          p.msgContraproposta = msg;
          addHistorico(p, `Contraproposta de ${HH.money(valor)} enviada.${msg ? ' Mensagem: ' + msg : ''}`);
          notificarPartes(p,
            `Você recebeu uma contraproposta de ${HH.money(valor)} para "${imovel.titulo}".`,
            `A imobiliária enviou uma contraproposta de ${HH.money(valor)} para a oferta de ${primeiroNome(cli)} em "${imovel.titulo}".`);
          HH.toast('Contraproposta enviada ao cliente.', 'ok');
          setTimeout(() => HH.render(), 0);
          return true;
        } },
      ],
    });
  }

  // ---------- Slot: card de propostas para o proprietário ----------
  HH.slot('proprietario.imovel', {
    order: 30,
    render: ({ imovel }) => {
      if (!imovel) return '';
      const list = HH.where('propostas', (p) => p.imovelId === imovel.id).sort(byDataDesc);
      const candidatas = list.filter((p) => p.status !== 'Recusada');
      const melhor = candidatas.length ? candidatas.reduce((a, b) => (HH.valorFinal(b) > HH.valorFinal(a) ? b : a)) : null;
      const item = (p) => {
        const pg = HH.pagamentoDe(p.id);
        const top = melhor && p.id === melhor.id;
        return `<div class="pp-owner-item ${top ? 'pp-melhor' : ''}">
          <div class="row between">
            <div><strong>${HH.money(HH.valorFinal(p))}</strong> ${diffPct(HH.valorFinal(p), imovel.valor)}
              ${p.contraproposta != null ? `<span class="small muted">(ofertado ${HH.money(p.valor)})</span>` : ''}
              ${top ? '<span class="badge primary">★ Melhor oferta</span>' : ''}</div>
            <div>${HH.badge(p.status)} ${pg ? HH.badge('Pago') : ''}</div>
          </div>
          <div class="small muted">${esc(primeiroNome(us(p.clienteId)))} · ${esc(p.pagamento)} · ${HH.date(p.data)}${p.cartaCredito ? ' · com carta de crédito' : ''}</div>
          ${historicoHtml(p, 2)}
        </div>`;
      };
      return `<div class="card pp-owner" data-proposta-owner>
        <div class="card-title"><h3>Propostas recebidas ${HH.ucTag('UC07')}</h3><span class="badge">${list.length}</span></div>
        ${list.length ? list.map(item).join('') : '<div class="empty">Nenhuma proposta recebida para este imóvel.</div>'}
      </div>`;
    },
  });

  // ---------- Slot: pendências no painel da equipe ----------
  HH.slot('painel.pendencias', {
    order: 30,
    render: ({ user }) => {
      if (!HH.isStaff(user)) return '';
      const emAnalise = HH.where('propostas', (p) => p.status === 'Em Análise').sort(byDataDesc);
      const aguardando = HH.where('propostas', (p) => p.status === 'Aprovada' && !HH.pagamentoDe(p.id)).sort(byDataDesc);
      return emAnalise.map((p) => `<li><a href="#/propostas">Proposta de ${HH.money(p.valor)} de ${esc(us(p.clienteId).nome)} para ${esc(im(p.imovelId).codigo)} em análise</a><div class="when">${HH.dateTime(p.data)}</div></li>`).join('')
        + aguardando.map((p) => `<li><a href="#/propostas">${esc(im(p.imovelId).codigo)}: proposta aprovada aguardando pagamento da taxa de reserva (${HH.money(HH.taxaReserva(p))})</a><div class="when">${esc(us(p.clienteId).nome)} · ${HH.dateTime(p.data)}</div></li>`).join('');
    },
  });
})();
