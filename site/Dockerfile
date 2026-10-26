# Build estático com Vite e entrega pelo nginx. Não há banco de dados: os dados são os
# JSON em public/dados, gerados por ../analisar_votos_pos17.py antes do build.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
