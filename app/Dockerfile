# Autopilot Sosial — imej untuk VPS / server (dengan Cloudflare Tunnel).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# data/ (pangkalan data, token, sesi WhatsApp) & muat naik disimpan dalam volume
VOLUME ["/app/data", "/app/public/uploads"]
EXPOSE 3000
CMD ["node", "--env-file-if-exists=.env", "server.js"]
