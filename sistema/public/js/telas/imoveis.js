// Tela CRUD 4 – Imóveis (tabela "imoveis")
import { brl, etiqueta, miniatura } from '../util.js';

const STATUS = ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Inativo'];

export default {
  titulo: 'Imóveis',
  recurso: 'imoveis',
  descricao: 'Carteira de imóveis. O código HH-0000 é gerado ao salvar.',
  fontes: {
    proprietarios: (p) => p.nome,
    corretores: (c) => `${c.nome}${c.ativo ? '' : ' (inativo)'}`,
  },
  campos: [
    { nome: 'titulo', rotulo: 'Título do anúncio' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', largura: 'terco', opcoes: ['Apartamento', 'Casa', 'Terreno', 'Sala comercial'] },
    // Ponto de variação VP3: só aparecem as modalidades do produto ativo.
    { nome: 'finalidade', rotulo: 'Finalidade', tipo: 'select', largura: 'terco', opcoes: (produto) => produto.features.modalidades },
    // Só na edição: o imóvel novo nasce "Disponível" e a reserva vem da proposta aprovada.
    { nome: 'status', rotulo: 'Status', tipo: 'select', largura: 'terco', opcoes: STATUS, soNaEdicao: true },
    { nome: 'preco', rotulo: 'Preço (R$)', tipo: 'number', largura: 'terco', dica: 'Na locação, valor do aluguel mensal.' },
    { nome: 'area', rotulo: 'Área (m²)', tipo: 'number', largura: 'terco' },
    { nome: 'quartos', rotulo: 'Quartos', tipo: 'number', largura: 'terco' },
    { nome: 'cep', rotulo: 'CEP', largura: 'terco', dica: 'Preenche o endereço pelo ViaCEP.' },
    { nome: 'logradouro', rotulo: 'Logradouro', largura: 'terco' },
    { nome: 'numero', rotulo: 'Número', largura: 'terco' },
    { nome: 'bairro', rotulo: 'Bairro', largura: 'terco' },
    { nome: 'cidade', rotulo: 'Cidade', largura: 'terco' },
    { nome: 'uf', rotulo: 'UF', largura: 'terco' },
    { nome: 'proprietarioId', rotulo: 'Proprietário', tipo: 'select', fonte: 'proprietarios', largura: 'metade' },
    { nome: 'corretorId', rotulo: 'Corretor responsável', tipo: 'select', fonte: 'corretores', largura: 'metade' },
  ],
  colunas: [
    { rotulo: '', valor: (i) => miniatura(i.id) },
    { rotulo: 'Código', valor: (i) => i.codigo, classe: 'nowrap' },
    { rotulo: 'Título', valor: (i) => i.titulo },
    { rotulo: 'Finalidade', valor: (i) => i.finalidade },
    { rotulo: 'Preço', valor: (i) => brl(i.preco) + (i.finalidade === 'Locação' ? '/mês' : '') },
    { rotulo: 'Endereço', valor: (i) => i.enderecoFormatado },
    { rotulo: 'Proprietário', valor: (i, tela) => tela.rotuloDe('proprietarios', i.proprietarioId) },
    { rotulo: 'Status', valor: (i) => etiqueta(i.status) },
  ],

  // Busca o endereço no ViaCEP quando o CEP é preenchido.
  aoAbrirFormulario(form) {
    form.elements.cep.addEventListener('change', async () => {
      const cep = form.elements.cep.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
        if (r.erro) return;
        form.elements.logradouro.value = r.logradouro || '';
        form.elements.bairro.value = r.bairro || '';
        form.elements.cidade.value = r.localidade || '';
        form.elements.uf.value = r.uf || '';
        form.elements.numero.focus();
      } catch {
        // Sem internet: o endereço é digitado à mão.
      }
    });
  },
};
