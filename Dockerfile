FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run build && npm run start -- --host 0.0.0.0"]
