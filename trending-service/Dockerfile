FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY app.js ./

EXPOSE 8083

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:8083/health || exit 1

CMD ["node", "app.js"]