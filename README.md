# HabitaHub – Plataforma Imobiliária

Projeto para fins educacionais.

## Sobre o HabitaHub

O HabitaHub é um sistema de gestão para o setor imobiliário desenvolvido para melhorar a rotina de vendas e a análise de corretores/proprietários. O Objetivo é unificar um sistema onde o corretor e o proprietário tenham suas áreas para navegar.

## Sistema

A primeira versão funcional fica em [`sistema/`](sistema/README.md). Ela tem back-end Node.js, banco PostgreSQL em container próprio, 6 telas de CRUD, 7 tabelas e login e criação de conta dos corretores, com aprovação por outro corretor (contas de demonstração com a senha `demo1234`). Também aplica os padrões Singleton, Template Method e Strategy e traz um exemplo de variabilidade com dois produtos da linha (LPS). A compactação de código focada em reuso está descrita em [`sistema/COMPACTACAO.md`](sistema/COMPACTACAO.md). Para rodar, use `docker compose up -d --build` ou, sem Docker, `cd sistema && npm install && npm start`, que usa SQLite local.

## Protótipo

Há um protótipo navegável em [`prototipo/`](prototipo/README.md) que cobre os 12 casos de uso. Para usar, abra `prototipo/index.html` no navegador ou sirva a pasta em um servidor local. As contas de demonstração usam a senha `demo1234`, e o botão **⚙ Simulador** força as falhas das APIs externas para demonstrar os fluxos de exceção.

### Rodando com Docker

```bash
docker compose up -d --build
```

O protótipo fica disponível em http://localhost:3100, e os dois produtos do sistema ficam em http://localhost:3200 (Lana Mayan) e http://localhost:3201 (Corretor Autônomo). O banco PostgreSQL roda no container `habitahub-banco`, acessível pela porta 5433. Para parar, use `docker compose down`.
