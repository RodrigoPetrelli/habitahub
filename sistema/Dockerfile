# HabitaHub – sistema (Node 24). O banco roda no container "banco" (PostgreSQL).

# Etapa 1: compacta o front-end (esbuild) em dist/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2: imagem final só com as dependências de produção e o front compactado.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=build /app/dist ./dist

ENV PORT=3200
ENV HABITAHUB_FRONT=dist
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3200/api/produto >/dev/null || exit 1

CMD ["node", "server.js"]
