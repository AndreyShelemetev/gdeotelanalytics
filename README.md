# Gdeotel Analytics

Next.js application for hotel analytics with data from Gdeotel.ru and Hotelin.com.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up SSH tunnel for database connection:
   ```bash
   ./start-tunnel.sh
   ```
   This will establish a persistent SSH tunnel to the remote MySQL server.

3. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

## Docker

Build and run with Docker:
```bash
docker-compose build
docker-compose up -d
```

## Database Connection

The application connects to a remote MySQL database via SSH tunnel. The tunnel forwards local port 13306 to the remote MySQL port 3306.

To set up SSH key authentication (recommended):
1. Generate SSH key: `ssh-keygen -t rsa -b 4096`
2. Copy public key to server: `ssh-copy-id root@217.168.244.143`
3. The tunnel script will use key authentication automatically.

## Features

- Dashboard with KPI cards and charts
- Filtering by country, region, city
- Local caching with IndexedDB for improved performance
- Authentication with NextAuth.js