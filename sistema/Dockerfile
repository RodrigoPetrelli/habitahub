# HabitaHub – sistema (Node 24). O banco roda no container "banco" (PostgreSQL).
FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=3200
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3200/api/produto >/dev/null || exit 1

CMD ["node", "server.js"]
