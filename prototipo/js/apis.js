/* HabitaHub – integrações externas (atores secundários dos casos de uso).
 * Todas são simuladas, exceto o ViaCEP, que usa a API real quando possível.
 * O comportamento de cada uma é controlado por HH.db.sim (painel "Simulador de APIs"),
 * para demonstrar os fluxos de exceção da especificação.
 *
 * Todas retornam Promise. Em falha, rejeitam com Error(mensagem da especificação).
 */
HH.api = (function () {
  'use strict';

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const latency = () => wait(500 + Math.random() * 700);
  const sim = () => HH.db.sim;
  const code = (p) => p + '-' + Math.random().toString(16).slice(2, 8).toUpperCase();

  // Opções exibidas no painel do simulador (usado por app.js).
  const OPTIONS = {
    viacep: { label: 'API ViaCEP', values: { real: 'Usar API real', fora: 'Indisponível (E1)', naoEncontrado: 'CEP não encontrado (A1)' } },
    creci: { label: 'API CRECI', values: { ativo: 'Registro ativo', suspenso: 'Inválido / suspenso (E2)' } },
    gateway: { label: 'Gateway de Pagamento', values: { aprovar: 'Aprovar transação', recusar: 'Recusar (E1)', timeout: 'Timeout (E2)' } },
    serasa: { label: 'API Serasa', values: { ok: 'Score regular', restricao: 'Restrição grave (E2)', fora: 'Fora do ar (E1)' } },
    assinatura: { label: 'Assinatura Digital', values: { todas: 'Todas as partes assinaram', parcial: 'Assinatura parcial (A1)', recusado: 'Recusado por signatário (E2)', fora: 'Provedor indisponível (E1)' } },
    oauth: { label: 'Login Google / Apple', values: { ok: 'Autoriza', negado: 'Usuário cancela' } },
  };

  // ---- AIE1: ViaCEP ----
  // Resolve { cep, logradouro, bairro, cidade, uf } ou null quando o CEP não existe (A1).
  // Rejeita com a mensagem E1 quando o serviço está indisponível.
  async function viaCep(cep) {
    const d = HH.onlyDigits(cep);
    const E1 = 'Serviço CEP indisponível. Preencha o endereço manualmente.';
    if (d.length !== 8) return null;
    if (sim().viacep === 'fora') { await latency(); throw new Error(E1); }
    if (sim().viacep === 'naoEncontrado') { await latency(); return null; }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: ctrl.signal });
      clearTimeout(t);
      const j = await res.json();
      if (j.erro) return null;
      return { cep: j.cep, logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf };
    } catch (e) {
      throw new Error(E1);
    }
  }

  // ---- AIE2: CRECI ----
  // Resolve { numero, uf, nome, status: 'Ativo' } ou rejeita com a mensagem E2 do UC01.
  async function creci(numero, uf, nome) {
    await latency();
    if (sim().creci === 'suspenso' || !numero) throw new Error('Registro CRECI inválido ou suspenso. Cadastro não permitido.');
    return { numero, uf, nome, status: 'Ativo' };
  }

  // ---- AIE3: Gateway de Pagamento ----
  // cobrar({ forma: 'PIX' | 'Cartão de Crédito', valor }) -> { transacaoId, status: 'Pago', forma, valor, data }
  async function cobrar({ forma, valor }) {
    await latency();
    if (sim().gateway === 'recusar') throw new Error('Transação não autorizada pela operadora. Tente outro método.');
    if (sim().gateway === 'timeout') { await wait(1500); throw new Error('Instabilidade no serviço de pagamento. Verifique seu extrato antes de tentar novamente.'); }
    return { transacaoId: code('GW'), status: 'Pago', forma, valor, data: new Date().toISOString() };
  }
  // Gera uma cobrança PIX (A1). O "webhook" de confirmação é aguardarPix().
  async function gerarPix(valor) {
    await latency();
    const txid = code('PIX');
    return { txid, copiaECola: `00020126580014BR.GOV.BCB.PIX0136habitahub-${txid.toLowerCase()}5204000053039865406${Number(valor).toFixed(2)}5802BR6009CURITIBA`, valor };
  }
  async function aguardarPix(txid, valor) {
    await wait(2500);
    return cobrar({ forma: 'PIX', valor }).then((r) => ({ ...r, transacaoId: txid }));
  }

  // ---- AIE5: Serasa ----
  // Resolve { score, situacao, restricao }. Rejeita (E1) quando fora do ar.
  async function serasa(cpf) {
    await latency();
    if (sim().serasa === 'fora') throw new Error('Serviço de análise de crédito indisponível.');
    if (sim().serasa === 'restricao') return { cpf, score: 210, situacao: 'Irregular', restricao: true };
    return { cpf, score: 650 + Math.floor(Math.random() * 300), situacao: 'Regular', restricao: false };
  }

  // ---- AIE4: Provedor de Assinatura Digital ----
  async function enviarEnvelope(signatarios) {
    await latency();
    if (sim().assinatura === 'fora') throw new Error('Não foi possível conectar ao provedor de assinaturas no momento.');
    return { envelopeId: code('ENV'), signatarios };
  }
  // statusEnvelope(envelopeId, assinaturas) -> { assinaturas: [...atualizadas], recusado: bool, pdfUrl|null }
  async function statusEnvelope(envelopeId, assinaturas) {
    await latency();
    const mode = sim().assinatura;
    if (mode === 'fora') throw new Error('Não foi possível conectar ao provedor de assinaturas no momento.');
    const now = new Date().toISOString();
    const list = assinaturas.map((a) => ({ ...a }));
    if (mode === 'recusado') {
      const alvo = list.find((a) => a.status !== 'Assinado') || list[list.length - 1];
      alvo.status = 'Recusado'; alvo.data = now;
      return { assinaturas: list, recusado: true, pdfUrl: null };
    }
    if (mode === 'parcial') {
      // Assina mais uma parte, mas deixa ao menos uma pendente.
      const pend = list.filter((a) => a.status !== 'Assinado');
      if (pend.length > 1) { pend[0].status = 'Assinado'; pend[0].data = now; }
      return { assinaturas: list, recusado: false, pdfUrl: null };
    }
    list.forEach((a) => { if (a.status !== 'Assinado') { a.status = 'Assinado'; a.data = now; } });
    return { assinaturas: list, recusado: false, pdfUrl: `https://assinatura.demo/${envelopeId}/documento-assinado.pdf` };
  }

  // ---- AIE6: Login social ----
  async function oauth(provedor) {
    await latency();
    if (sim().oauth === 'negado') throw new Error('Login cancelado pelo usuário.');
    const n = Math.floor(Math.random() * 900 + 100);
    return { provedor, token: code('TK'), email: `usuario${n}@${provedor === 'Apple' ? 'icloud.com' : 'gmail.com'}`, nome: `Usuário ${provedor} ${n}`, verificado: true };
  }

  return { OPTIONS, viaCep, creci, cobrar, gerarPix, aguardarPix, serasa, enviarEnvelope, statusEnvelope, oauth };
})();
