FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
CMD ["npm", "start"]
