# HabitaHub – Plataforma Imobiliária

Projeto para fins educacionais.

## Sobre o HabitaHub

O HabitaHub é um sistema de gestão para o setor imobiliário desenvolvido para melhorar a rotina de vendas e a análise de corretores/proprietários. O Objetivo é unificar um sistema onde o corretor e o proprietário tenham suas áreas para navegar.

## Protótipo

Há um protótipo navegável em [`prototipo/`](prototipo/README.md) que cobre os 12 casos de uso. Para usar, abra `prototipo/index.html` no navegador ou sirva a pasta em um servidor local. As contas de demonstração usam a senha `demo1234`, e o botão **⚙ Simulador** força as falhas das APIs externas para demonstrar os fluxos de exceção.

### Rodando com Docker

```bash
docker compose up -d --build
```

O protótipo fica disponível em http://localhost:3100. Para parar, use `docker compose down`.
