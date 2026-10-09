# HabitaHub – sistema (Node 24 + SQLite nativo, sem dependências externas)
FROM node:24-alpine

WORKDIR /app
COPY . .

ENV PORT=3200
EXPOSE 3200
VOLUME /app/dados

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3200/api/produto >/dev/null || exit 1

CMD ["node", "server.js"]
