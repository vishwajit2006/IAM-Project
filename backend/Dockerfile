FROM node:20.18.1-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
USER node
CMD ["npm","start"]