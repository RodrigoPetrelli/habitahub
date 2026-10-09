import { api, el } from './util.js';

// Telas de acesso (login e "Criar conta"), no layout das telas de acesso do
// protótipo (prototipo/js/modules/acesso.js): marca + cartão centralizado.

const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 14.5h5"/></svg>';

// Corretores criados pelo seed (src/infra/seed.js), com a senha demo1234.
const CONTAS_DEMO = [
  { nome: 'Carla Mendes', email: 'carla@habitahub.demo' },
  { nome: 'Rafael Costa', email: 'rafael@habitahub.demo' },
];

// ---------- Peças comuns ----------

const marca = (produto) => el('div', { class: 'acesso-brand' },
  el('span', { class: 'logo', html: `${LOGO} HabitaHub` }),
  el('p', { class: 'muted' }, produto.nome));

const alerta = (texto = '') => el('div', { class: `alert danger${texto ? '' : ' hidden'}`, role: 'alert' }, texto);

function mostrarAlerta(caixa, texto) {
  caixa.textContent = texto;
  caixa.classList.remove('hidden');
}

// Campo de senha com o botão "Mostrar".
function campoSenha(atributos) {
  const entrada = el('input', { class: 'input', type: 'password', ...atributos });
  const botao = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Mostrar senha', onclick: () => {
    const visivel = entrada.type === 'password';
    entrada.type = visivel ? 'text' : 'password';
    botao.textContent = visivel ? 'Ocultar' : 'Mostrar';
  } }, 'Mostrar');
  return { entrada, no: el('div', { class: 'acesso-pass' }, entrada, botao) };
}

// Botão de envio com "Aguarde…" enquanto a Promise roda.
async function ocupado(botao, texto, promessa) {
  const original = botao.textContent;
  botao.disabled = true;
  botao.replaceChildren(el('span', { class: 'spinner' }), ` ${texto}`);
  try {
    return await promessa;
  } finally {
    botao.disabled = false;
    botao.replaceChildren(original);
  }
}

// ---------- Login ----------

// Chama aoEntrar(usuario) quando o login dá certo.
export function montarLogin(container, { produto, aviso, sucesso, aoEntrar }) {
  const erro = alerta(aviso);
  const ok = el('div', { class: `alert ok${sucesso ? '' : ' hidden'}`, role: 'status' }, sucesso || '');
  const email = el('input', { class: 'input', id: 'login-email', name: 'email', type: 'email', autocomplete: 'username', required: true });
  const senha = campoSenha({ id: 'login-senha', name: 'senha', autocomplete: 'current-password', required: true });
  const entrar = el('button', { type: 'submit', class: 'btn btn-primary btn-full' }, 'Entrar');

  const form = el('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    erro.classList.add('hidden');
    ok.classList.add('hidden');
    [email, senha.entrada].forEach((c) => c.classList.toggle('invalid', !c.value.trim()));
    if (!email.value.trim() || !senha.entrada.value) {
      mostrarAlerta(erro, 'Informe e-mail e senha.');
      form.querySelector('.invalid')?.focus();
      return;
    }
    try {
      aoEntrar(await ocupado(entrar, 'Entrando…', api('POST', '/api/login', { email: email.value.trim(), senha: senha.entrada.value })));
    } catch (falha) {
      mostrarAlerta(erro, falha.message);
      senha.entrada.value = '';
      senha.entrada.focus();
    }
  } },
  el('div', { class: 'field' }, el('label', { for: 'login-email' }, 'E-mail'), email),
  el('div', { class: 'field' }, el('label', { for: 'login-senha' }, 'Senha'), senha.no),
  entrar);

  const usarConta = (conta) => {
    email.value = conta.email;
    email.classList.remove('invalid');
    senha.entrada.focus();
  };

  container.replaceChildren(el('div', { class: 'auth-card' },
    marca(produto),
    el('div', { class: 'card' },
      el('h2', {}, 'Entrar'),
      el('p', { class: 'muted' }, 'Acesso da equipe de corretores.'),
      ok, erro, form,
      el('p', { class: 'acesso-center' }, 'Ainda não tem conta? ', el('a', { href: '#/cadastro' }, el('strong', {}, 'Criar conta')))),
    el('div', { class: 'card' },
      el('h3', {}, 'Contas de demonstração'),
      el('p', { class: 'small muted' }, 'Senha de todas: demo1234'),
      el('ul', { class: 'acesso-demos' }, CONTAS_DEMO.map((c) => el('li', {},
        el('span', { class: 'info' }, el('strong', {}, c.nome), el('span', { class: 'small muted' }, c.email)),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => usarConta(c) }, 'Usar')))))));
  email.focus();
}

// ---------- Criar conta ----------

// Mesma regra e mesmo indicador de força do protótipo (UC05 E2).
const senhaForte = (s) => s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);

function forcaDaSenha(s) {
  if (!s) return { nivel: 0, rotulo: 'Digite uma senha' };
  if (!senhaForte(s)) return { nivel: 1, rotulo: 'Fraca – não atende aos requisitos mínimos' };
  const pontos = [s.length >= 12, /[a-z]/.test(s) && /[A-Z]/.test(s), /[^A-Za-z0-9]/.test(s)].filter(Boolean).length;
  return pontos >= 2 ? { nivel: 3, rotulo: 'Forte' } : { nivel: 2, rotulo: 'Média – atende aos requisitos' };
}

function medidorDeForca(entrada) {
  const rotulo = el('div', { class: 'small rotulo' });
  const requisitos = [
    ['Mínimo de 8 caracteres', (s) => s.length >= 8],
    ['Pelo menos uma letra', (s) => /[A-Za-z]/.test(s)],
    ['Pelo menos um número', (s) => /\d/.test(s)],
  ].map(([texto, teste]) => ({ teste, no: el('li', {}, texto) }));
  const medidor = el('div', { class: 'acesso-meter', 'aria-live': 'polite' },
    el('div', { class: 'acesso-meter-bar' }, el('span'), el('span'), el('span')),
    rotulo,
    el('ul', { class: 'acesso-reqs small' }, requisitos.map((r) => r.no)));
  const atualizar = () => {
    const forca = forcaDaSenha(entrada.value);
    medidor.dataset.nivel = forca.nivel;
    rotulo.textContent = forca.rotulo;
    requisitos.forEach((r) => r.no.classList.toggle('ok', r.teste(entrada.value)));
  };
  entrada.addEventListener('input', atualizar);
  atualizar();
  return medidor;
}

// Chama aoConcluir(email) quando o cadastro é enviado.
export function montarCadastro(container, { produto, aoConcluir }) {
  const erro = alerta();
  const senha = campoSenha({ id: 'cad-senha', name: 'senha', autocomplete: 'new-password' });
  const confirmacao = campoSenha({ id: 'cad-confirmacao', name: 'confirmacao', autocomplete: 'new-password' });
  const enviar = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Criar conta');

  const campo = (nome, rotulo, entrada, { largura = '', dica } = {}) => el('div', { class: `field ${largura}`, 'data-campo': nome },
    el('label', { for: entrada.id || entrada.querySelector('input').id }, rotulo),
    entrada,
    dica ? el('span', { class: 'hint' }, dica) : null,
    el('span', { class: 'error-msg' }));
  const texto = (nome, atributos) => el('input', { class: 'input', id: `cad-${nome}`, name: nome, ...atributos });

  const marcarErros = (form, erros) => {
    form.querySelectorAll('.field[data-campo]').forEach((c) => {
      const msg = erros[c.dataset.campo] || '';
      c.querySelector('.input').classList.toggle('invalid', Boolean(msg));
      c.querySelector('.error-msg').textContent = msg;
    });
    form.querySelector('.invalid')?.focus();
  };

  const form = el('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    erro.classList.add('hidden');
    const dados = Object.fromEntries(['nome', 'email', 'telefone', 'creci'].map((n) => [n, form.elements[n].value.trim()]));
    dados.senha = senha.entrada.value;

    // Conferências que dão para fazer aqui; as demais regras vêm do servidor.
    const erros = {};
    if (!dados.senha) erros.senha = 'Senha é obrigatória.';
    else if (!senhaForte(dados.senha)) erros.senha = 'Use 8 ou mais caracteres, com letras e números.';
    if (confirmacao.entrada.value !== dados.senha) erros.confirmacao = 'As senhas não conferem.';
    marcarErros(form, erros);
    if (Object.keys(erros).length) return;

    try {
      await ocupado(enviar, 'Enviando…', api('POST', '/api/cadastro', dados));
      aoConcluir(dados.email);
    } catch (falha) {
      marcarErros(form, falha.erros || {});
      mostrarAlerta(erro, falha.message);
    }
  } },
  erro,
  el('div', { class: 'form-grid' },
    campo('nome', 'Nome completo', texto('nome', { autocomplete: 'name' })),
    campo('email', 'E-mail', texto('email', { type: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com' }), { largura: 'metade' }),
    campo('telefone', 'Telefone / WhatsApp', texto('telefone', { type: 'tel', autocomplete: 'tel', placeholder: '(41) 99999-0000' }), { largura: 'metade' }),
    campo('creci', 'CRECI', texto('creci', { placeholder: '12345-F/PR' }), { largura: 'metade', dica: 'Número, tipo e UF da inscrição.' }),
    el('div', { class: 'field metade', 'aria-hidden': 'true' }), // completa a linha do CRECI
    campo('senha', 'Senha', senha.no, { largura: 'metade' }),
    campo('confirmacao', 'Confirmar senha', confirmacao.no, { largura: 'metade' }),
    medidorDeForca(senha.entrada)),
  el('div', { class: 'row between acesso-acoes' }, el('a', { class: 'btn', href: '#/login' }, 'Voltar'), enviar));

  container.replaceChildren(el('div', { class: 'auth-card largo' },
    marca(produto),
    el('div', { class: 'card' },
      el('h2', {}, 'Criar conta de corretor'),
      el('p', { class: 'muted' }, 'Depois do envio, um corretor da equipe precisa aprovar o seu cadastro. Você vai receber um aviso quando o acesso for liberado.'),
      form),
    el('p', { class: 'acesso-center' }, 'Já tem conta? ', el('a', { href: '#/login' }, 'Entrar'))));
  form.elements.nome.focus();
}
