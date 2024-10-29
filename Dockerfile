FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy all source files
COPY . .

# Install server dependencies
RUN npm install

# Install client dependencies and build
RUN cd client && \
    npm install && \
    npm run build && \
    ls -la build/  # Debug: verify build files exist

# Verify final structure
RUN ls -la /usr/src/app/client/build/

EXPOSE 5000

CMD ["npm", "start"]