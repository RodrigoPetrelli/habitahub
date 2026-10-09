// Dados de demonstração, gravados pelos próprios repositórios (passam pelas
// validações e geram notificações). Respeitam as features do produto ativo e
// ficam numa organização própria (organizacaoPadrao, no JSON do produto).
const Configuracao = require('./Configuracao');
const CorretorRepositorio = require('../repositorios/CorretorRepositorio');
const ProprietarioRepositorio = require('../repositorios/ProprietarioRepositorio');
const ClienteRepositorio = require('../repositorios/ClienteRepositorio');
const ImovelRepositorio = require('../repositorios/ImovelRepositorio');
const VisitaRepositorio = require('../repositorios/VisitaRepositorio');
const PropostaRepositorio = require('../repositorios/PropostaRepositorio');
const OrganizacaoRepositorio = require('../repositorios/OrganizacaoRepositorio');
const Database = require('./Database');
const { naOrganizacao } = require('./ContextoOrganizacao');

// Senha das contas de demonstração (a mesma do protótipo).
const SENHA_DEMO = 'demo1234';

// Completa um CPF fictício com os dígitos verificadores corretos.
function cpf(base9) {
  const d = base9.split('').map(Number);
  for (const n of [9, 10]) {
    const soma = d.reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join('');
}

function diasAPartirDeHoje(dias, hora) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return `${data.toISOString().slice(0, 10)}T${hora}`;
}

// Nome da organização de demonstração (e da que adota os dados de bancos antigos).
const nomeDaOrganizacaoPadrao = () => Configuracao.instancia().produto.organizacaoPadrao;

async function popularSeVazio() {
  const db = Database.instancia();
  if ((await db.um('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM corretores')).n > 0) return false;
  return db.transacao(async () => {
    const organizacao = await new OrganizacaoRepositorio().salvar({ nome: nomeDaOrganizacaoPadrao() });
    return naOrganizacao(organizacao.id, popularOrganizacaoDemo);
  });
}

async function popularOrganizacaoDemo() {
  const corretores = new CorretorRepositorio();
  const config = Configuracao.instancia();
  const locacao = config.opcoes('modalidades').includes('Locação');

  const carla = await corretores.salvar({ nome: 'Carla Mendes', email: 'carla@habitahub.demo', telefone: '(41) 99876-1001', creci: '12345-F/PR', ativo: true, administrador: true, senha: SENHA_DEMO });
  const rafael = await corretores.salvar({ nome: 'Rafael Costa', email: 'rafael@habitahub.demo', telefone: '(41) 99876-1002', creci: '23456-F/PR', ativo: true, senha: SENHA_DEMO });

  const proprietarios = new ProprietarioRepositorio();
  const joao = await proprietarios.salvar({ nome: 'João Pereira', cpf: cpf('000000002'), email: 'joao@habitahub.demo', telefone: '(41) 98888-2001' });
  const paulo = await proprietarios.salvar({ nome: 'Paulo Lima', cpf: cpf('000000003'), email: 'paulo@habitahub.demo', telefone: '(41) 98888-2002' });

  const clientes = new ClienteRepositorio();
  const mariana = await clientes.salvar({ nome: 'Mariana Souza', cpf: cpf('000000001'), email: 'mariana@habitahub.demo', telefone: '(41) 97777-3001', interesse: 'Venda' });
  const lucas = await clientes.salvar({ nome: 'Lucas Andrade', cpf: cpf('000000004'), email: 'lucas@habitahub.demo', telefone: '(41) 97777-3002', interesse: locacao ? 'Locação' : 'Venda' });

  const imoveis = new ImovelRepositorio();
  const batel = await imoveis.salvar({
    titulo: 'Apartamento 3 quartos no Batel', tipo: 'Apartamento', finalidade: 'Venda', preco: 890000, area: 98, quartos: 3,
    cep: '80420090', logradouro: 'Rua Bento Viana', numero: '1200', bairro: 'Batel', cidade: 'Curitiba', uf: 'PR',
    proprietarioId: joao.id, corretorId: carla.id,
  });
  await imoveis.salvar({
    titulo: 'Casa com quintal no Bacacheri', tipo: 'Casa', finalidade: 'Venda', preco: 640000, area: 160, quartos: 3,
    cep: '82520000', logradouro: 'Rua Holanda', numero: '455', bairro: 'Bacacheri', cidade: 'Curitiba', uf: 'PR',
    proprietarioId: paulo.id, corretorId: rafael.id,
  });
  const studio = await imoveis.salvar({
    titulo: locacao ? 'Studio mobiliado no Centro' : 'Studio no Centro', tipo: 'Apartamento',
    finalidade: locacao ? 'Locação' : 'Venda', preco: locacao ? 1850 : 310000, area: 32, quartos: 1,
    cep: '80020000', logradouro: 'Rua XV de Novembro', numero: '800', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR',
    proprietarioId: paulo.id, corretorId: carla.id,
  });

  if (config.temFeature('visitas')) {
    const visitas = new VisitaRepositorio();
    const v = await visitas.salvar({ imovelId: batel.id, clienteId: mariana.id, corretorId: carla.id, dataHora: diasAPartirDeHoje(-3, '10:00') });
    await visitas.salvar({ status: 'Realizada', feedback: 'Cliente gostou da planta e da vista; achou o condomínio alto.' }, v.id);
    await visitas.salvar({ imovelId: studio.id, clienteId: lucas.id, corretorId: carla.id, dataHora: diasAPartirDeHoje(2, '15:30') });
  }

  if (config.temFeature('propostas')) {
    const propostas = new PropostaRepositorio();
    await propostas.salvar({ imovelId: batel.id, clienteId: mariana.id, valor: 850000, condicoes: 'Financiamento de 70% pela Caixa.' });
  }
  return true;
}

// Bancos populados antes do login existir têm os corretores de demonstração sem
// senha. Aqui eles recebem a senha de demonstração; outros corretores não são tocados.
async function garantirAcessoDeDemonstracao() {
  const db = Database.instancia();
  const semSenha = await db.todos("SELECT id, organizacao_id FROM corretores WHERE senha_hash IS NULL AND email LIKE '%@habitahub.demo'");
  for (const c of semSenha) await naOrganizacao(c.organizacao_id, () => new CorretorRepositorio().salvar({ senha: SENHA_DEMO }, c.id));
  return semSenha.length;
}

// Bancos criados antes das organizações têm registros sem organizacao_id: todos
// passam a ser da organização padrão do produto (criada aqui, se ainda não existir).
async function adotarDadosSemOrganizacao() {
  const db = Database.instancia();
  const orfaos = await Promise.all(Database.TABELAS_DA_ORGANIZACAO.map((t) => db.um(`SELECT id FROM ${t} WHERE organizacao_id IS NULL`)));
  if (!orfaos.some(Boolean)) return null;
  return db.transacao(async () => {
    const organizacoes = new OrganizacaoRepositorio();
    const nome = nomeDaOrganizacaoPadrao();
    const organizacao = (await organizacoes.listar()).find((o) => o.nome === nome) || await organizacoes.salvar({ nome });
    for (const tabela of Database.TABELAS_DA_ORGANIZACAO) {
      await db.rodar(`UPDATE ${tabela} SET organizacao_id = ? WHERE organizacao_id IS NULL`, [organizacao.id]);
    }
    console.log(`Registros sem organização passaram para "${organizacao.nome}".`);
    return organizacao;
  });
}

// Uma organização sem administrador ativo não teria quem aprovasse contas novas:
// o corretor ativo mais antigo dela vira administrador (na demonstração, a Carla).
// Devolve os corretores promovidos.
async function garantirAdministrador() {
  const promovidos = [];
  for (const organizacao of await new OrganizacaoRepositorio().listar()) {
    await naOrganizacao(organizacao.id, async () => {
      const corretores = new CorretorRepositorio();
      if ((await corretores.administradoresAtivos()).length) return;
      const [maisAntigo] = (await corretores.listar()).filter((c) => c.ativo).sort((a, b) => a.id - b.id);
      if (!maisAntigo) return;
      promovidos.push(await corretores.salvar({ administrador: true }, maisAntigo.id));
      console.log(`"${organizacao.nome}" estava sem administrador ativo: ${maisAntigo.nome} (${maisAntigo.email}) virou administrador.`);
    });
  }
  return promovidos;
}

module.exports = { popularSeVazio, adotarDadosSemOrganizacao, garantirAcessoDeDemonstracao, garantirAdministrador, SENHA_DEMO };
