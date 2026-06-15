# Office web (Vite/React) → static build served by nginx. Build context = office repo root.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci

# The browser uses these at runtime; Vite bakes them into the static build.
# VITE_OFFICE_GATEWAY_URL is the PUBLIC office-server (API) origin — not a secret.
ARG VITE_OFFICE_MODE=connected
ARG VITE_OFFICE_GATEWAY_URL=http://localhost:8787
ENV VITE_OFFICE_MODE=$VITE_OFFICE_MODE
ENV VITE_OFFICE_GATEWAY_URL=$VITE_OFFICE_GATEWAY_URL

# Default Vite mode + our env vars (Vite includes VITE_-prefixed process.env vars).
RUN npm run build -w @trading-office/web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
