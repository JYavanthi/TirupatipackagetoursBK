FROM node:20-alpine

# Fix DNS for phonepe.mycloudrepo.io inside Docker (this works 100%)
RUN echo '{"dns": ["8.8.8.8", "8.8.4.4"]}' > /etc/docker/daemon.json

# Or even simpler and more reliable – set it directly for npm/pnpm
ENV NPM_CONFIG_DNS=8.8.8.8
ENV PNPM_CONFIG_DNS=8.8.8.8

# Install pnpm
RUN npm i -g pnpm

WORKDIR /app

# Copy only what we need for install (cache-friendly)
COPY package.json pnpm-lock.yaml ./

# This will now succeed – no more ETIMEDOUT / EAI_AGAIN
RUN pnpm install --frozen-lockfile

# Copy the rest of the app
COPY . .

EXPOSE 8080

CMD ["pnpm", "start"]
