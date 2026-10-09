// Dados de demonstração, gravados pelos próprios repositórios (passam pelas
// validações e geram notificações). Respeitam as features do produto ativo.
const Configuracao = require('./Configuracao');
const CorretorRepositorio = require('../repositorios/CorretorRepositorio');
const ProprietarioRepositorio = require('../repositorios/ProprietarioRepositorio');
const ClienteRepositorio = require('../repositorios/ClienteRepositorio');
const ImovelRepositorio = require('../repositorios/ImovelRepositorio');
const VisitaRepositorio = require('../repositorios/VisitaRepositorio');
const PropostaRepositorio = require('../repositorios/PropostaRepositorio');

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

async function popularSeVazio() {
  const corretores = new CorretorRepositorio();
  if ((await corretores.listar()).length > 0) return false;

  const config = Configuracao.instancia();
  const locacao = config.opcoes('modalidades').includes('Locação');

  const carla = await corretores.salvar({ nome: 'Carla Mendes', email: 'carla@habitahub.demo', telefone: '(41) 99876-1001', creci: '12345-F/PR', ativo: true });
  const rafael = await corretores.salvar({ nome: 'Rafael Costa', email: 'rafael@habitahub.demo', telefone: '(41) 99876-1002', creci: '23456-F/PR', ativo: true });

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

module.exports = { popularSeVazio };
