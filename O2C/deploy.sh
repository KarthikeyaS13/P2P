#!/bin/bash

# ==============================================================================
# O2C Portal - Automated Deployment Script
# Run this script on your production Ubuntu/Debian server using: sudo bash deploy.sh
# ==============================================================================

echo "Starting automated deployment..."

# 1. Ensure we are in the right directory
# Update this path if your O2C project is hosted elsewhere on the production server
PROJECT_DIR="/var/www/O2C"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Error: Could not find the project directory at $PROJECT_DIR"
    echo "Please update the PROJECT_DIR variable in this script."
    exit 1
fi

cd "$PROJECT_DIR"
echo "✅ Found project directory at $PROJECT_DIR"

# 1.5 Pull Latest Code
echo "📥 Pulling latest code from GitHub..."
git fetch origin main
git reset --hard origin/main

# 2. Build the React Frontend
echo "📦 Building the React Frontend..."
npm install
npm run build

if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "❌ Error: React build failed. 'dist' directory not found."
    exit 1
fi
echo "✅ React frontend built successfully."

# 3. Setup the Backend
echo "⚙️ Setting up the Node.js Backend..."
cd server
npm install
npm install -g pm2

# Stop existing PM2 process if it exists
pm2 stop o2c-backend 2>/dev/null
pm2 delete o2c-backend 2>/dev/null

# Start the backend via PM2 (pointing to server.js since we are inside the 'server' folder)
pm2 start server.js --name "o2c-backend" --update-env
pm2 save
pm2 startup
echo "✅ Backend started with PM2."

# 4. Setup Nginx Configuration (Skipped as Certbot handles it)
echo "🌐 Nginx configuration is handled separately for SSL."

# 5. Fix Permissions
echo "🔒 Fixing File Permissions..."
chown -R www-data:www-data $PROJECT_DIR/dist
chmod -R 755 $PROJECT_DIR/dist

# 6. Restart Nginx
echo "🔄 Restarting Nginx..."
nginx -t
if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo "✅ Nginx restarted successfully."
else
    echo "❌ Nginx configuration test failed. Please check the config."
    exit 1
fi

echo "=============================================================================="
echo "🎉 DEPLOYMENT COMPLETE! 🎉"
echo "Your application has been deployed."
echo "If you see a 500 error, run: sudo tail -50 /var/log/nginx/error.log"
echo "=============================================================================="
