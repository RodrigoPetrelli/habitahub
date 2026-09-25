# HabitaHub – Plataforma Imobiliária

Projeto Extensionista da disciplina **Medição e Análise de Processos e Produtos de Software**.

**Equipe:** Erik Carvalho, Luiz Eduardo Assi, Rodrigo Glir
**Instituição parceira:** Lana Mayan – Negócios Imobiliários Ltda (Curitiba – PR)

## Sobre

O HabitaHub é uma plataforma web dupla:

- **Portal de vendas e gestão** para a imobiliária (cadastro e filtragem de imóveis, agenda de visitas, propostas, contratos);
- **Área logada para proprietários**, que acompanham o status dos seus imóveis (visitas, propostas e feedbacks).

O objetivo é reduzir a ansiedade dos proprietários com um canal de feedback contínuo e diminuir o trabalho manual dos corretores.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| `PROJETO MEDIÇÃO DE SOFTWARE - HABITAHUB.odt` | Medição do software: atores, casos de uso, UCP, pontos de função e estimativas |

## Resumo das medições

**Pontos de Caso de Uso (UCP)**

| Métrica | Valor |
|---|---|
| UAW (7 atores: 5 APIs + 2 humanos) | 11 |
| UUCW (12 casos de uso) | 100 |
| UUCP | 111 |
| TCF | 1,015 |
| ECF | 0,680 |
| **UCP ajustado** | **76,61** |

**Pontos de Função**

- ALIs + AIEs: 72 PF
- Entradas Externas (EE): 49 PF

**Casos de uso:** UC01 Incluir Imóvel · UC02 Alterar Imóvel · UC03 Excluir Imóvel · UC04 Agendar Visita · UC05 Cadastrar Perfil · UC06 Alterar Perfil · UC07 Registrar Proposta · UC08 Confirmar Pagamento de Taxa · UC09 Gerar Contrato · UC10 Alterar Contrato · UC11 Registrar Avaliação · UC12 Importar Assinaturas

**Integrações externas:** ViaCEP, CRECI, Gateway de Pagamento, Assinatura Digital, Serasa.

## Protótipo

Há um protótipo navegável em [`prototipo/`](prototipo/README.md) que cobre os 12 casos de uso. Para usar, abra `prototipo/index.html` no navegador ou sirva a pasta em um servidor local. As contas de demonstração usam a senha `demo1234`, e o botão **⚙ Simulador** força as falhas das APIs externas para demonstrar os fluxos de exceção.

### Rodando com Docker

```bash
docker compose up -d --build
```

O protótipo fica disponível em http://localhost:3100. Para parar, use `docker compose down`.
