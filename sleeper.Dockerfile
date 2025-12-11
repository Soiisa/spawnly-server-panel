# sleeper.Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy the script
COPY scripts/sleeper.js ./scripts/

# Expose the Minecraft port
EXPOSE 25565

# Start the sleeper
CMD ["npm", "run", "start:sleeper"]