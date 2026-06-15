# Office gateway/server (Hono, stateless). Runs via tsx. Build context = office repo root.
FROM node:22-bookworm-slim
WORKDIR /app
# npm workspaces: the whole repo is needed to resolve workspace deps.
COPY . .
RUN npm ci
EXPOSE 8787
CMD ["npm", "run", "start", "-w", "@trading-office/server"]
