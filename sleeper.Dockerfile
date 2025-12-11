# sleeper.Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
# We use 'npm install' instead of 'npm ci' to generate the missing lockfile entries for varint
COPY package.json package-lock.json ./
RUN npm install

# Copy the script
COPY scripts/sleeper.js ./scripts/

# Expose the Minecraft port
EXPOSE 25565

# Start the sleeper
CMD ["npm", "run", "start:sleeper"]